## Visualize Cleaned GPS Data
## Creates a single HTML file with tabs for each activity
## Shows denoised trace and filtered-out points

message("\n=== Stage 4: Visualizing Cleaned Data ===\n")

## helper functions ----

# Create map for a single activity showing cleaned trace and removed points with terrain coloring
create_activity_map <- function(original_points, denoised_points, terrain_sections, distance_intervals, activity_id) {
  # Get original and denoised data for this activity
  orig_act <- original_points %>%
    filter(activity_id == !!activity_id) %>%
    arrange(time) %>%
    mutate(timestamp = ymd_hms(time))

  clean_act <- denoised_points %>%
    filter(activity_id == !!activity_id) %>%
    arrange(time) %>%
    mutate(timestamp = ymd_hms(time))

  # Find removed points (in original but not in denoised)
  removed_points <- orig_act %>%
    anti_join(clean_act, by = c("activity_id", "timestamp"))

  # Get terrain sections for this activity
  activity_sections <- terrain_sections %>%
    filter(activity_id == !!activity_id) %>%
    arrange(section_id)

  # Vectorized approach: assign terrain type based on point position
  if (nrow(activity_sections) > 0 && nrow(clean_act) > 0) {
    total_points <- nrow(clean_act)
    total_intervals <- sum(activity_sections$n_intervals)

    # Create terrain type vector efficiently using cut
    interval_proportions <- cumsum(activity_sections$n_intervals) / total_intervals
    break_points <- c(0, round(interval_proportions * total_points))

    # Ensure break_points are unique and increasing
    break_points <- unique(break_points)
    if (break_points[length(break_points)] < total_points) {
      break_points[length(break_points)] <- total_points
    }

    clean_act_with_terrain <- clean_act %>%
      mutate(
        section_id = cut(
          row_number(),
          breaks = break_points,
          labels = FALSE,
          include.lowest = TRUE,
          right = TRUE
        )
      )

    # Handle any NA section_ids
    clean_act_with_terrain <- clean_act_with_terrain %>%
      mutate(
        section_id = if_else(is.na(section_id), 1L, as.integer(section_id)),
        section_id = pmin(section_id, nrow(activity_sections)),
        terrain_type = activity_sections$terrain_type[section_id]
      )
  } else {
    clean_act_with_terrain <- clean_act %>%
      mutate(terrain_type = "flats")
  }

  # Count statistics
  n_original <- nrow(orig_act)
  n_cleaned <- nrow(clean_act)
  n_removed <- nrow(removed_points)
  pct_removed <- round(100 * n_removed / n_original, 1)

  # Terrain colors (from global parameters)
  terrain_colors <- c(
    "climbing" = color_climbing,
    "flats" = color_flats,
    "descending" = color_descending,
    "unknown" = color_removed_points
  )

  # Create leaflet map
  map <- leaflet(height = 591) %>%
    addTiles() %>%
    # Removed points (light grey markers) - add first so they appear behind
    addCircleMarkers(
      data = removed_points,
      lng = ~lon,
      lat = ~lat,
      radius = 3,
      color = color_removed_points,
      fillColor = color_removed_points,
      fillOpacity = 0.5,
      weight = 1,
      group = "Removed Points",
      popup = ~paste0(
        "<b>Removed Point</b><br>",
        "Time: ", format(timestamp, "%H:%M:%S"), "<br>",
        "Elevation: ", round(elevation_ft, 1), " ft"
      )
    )

  # Add segment_group to identify continuous sections of same terrain
  clean_act_with_terrain <- clean_act_with_terrain %>%
    arrange(timestamp) %>%
    mutate(
      # Create group ID that changes whenever terrain type changes
      terrain_change = terrain_type != lag(terrain_type, default = ""),
      segment_group = cumsum(terrain_change)
    )

  # Add colored trace segments for each continuous section
  # Draw each continuous segment separately to avoid connecting lines
  terrain_types <- unique(clean_act_with_terrain$terrain_type)
  terrain_types <- terrain_types[!is.na(terrain_types)]

  if (length(terrain_types) > 0) {
    # Get unique segment groups
    segment_groups <- clean_act_with_terrain %>%
      group_by(segment_group, terrain_type) %>%
      summarise(n = n(), .groups = "drop") %>%
      filter(n > 1)  # Only draw segments with at least 2 points

    for (i in seq_len(nrow(segment_groups))) {
      seg <- segment_groups[i, ]
      terrain <- seg$terrain_type

      segment_data <- clean_act_with_terrain %>%
        filter(segment_group == seg$segment_group,
               !is.na(lon), !is.na(lat)) %>%
        arrange(timestamp)

      if (nrow(segment_data) > 0) {
        map <- map %>%
          addPolylines(
            data = segment_data,
            lng = ~lon,
            lat = ~lat,
            color = unname(terrain_colors[terrain]),  # unname() to avoid jsonlite warning
            weight = 3,
            opacity = 0.8,
            group = paste0(tools::toTitleCase(terrain), " Sections")
          )
      }
    }
  } else {
    # Fallback: if no terrain types, show whole trace in blue
    map <- map %>%
      addPolylines(
        data = clean_act,
        lng = ~lon,
        lat = ~lat,
        color = "#4169E1",
        weight = 3,
        opacity = 0.8,
        group = "Activity Trace"
      )
  }

  # Add layer control
  layer_groups <- c(
    paste0(tools::toTitleCase(unique(clean_act_with_terrain$terrain_type)), " Sections"),
    "Removed Points"
  )

  map <- map %>%
    addLayersControl(
      overlayGroups = layer_groups,
      options = layersControlOptions(collapsed = FALSE)
    ) %>%
    # Fit bounds to show entire track
    fitBounds(
      lng1 = min(orig_act$lon),
      lat1 = min(orig_act$lat),
      lng2 = max(orig_act$lon),
      lat2 = max(orig_act$lat)
    )

  return(map)
}

# Create time series plots for elevation, speed, and elevation gain with terrain shading
create_activity_plots <- function(denoised_points, denoised_segments, terrain_sections, activity_id) {
  # Get data for this activity
  clean_points <- denoised_points %>%
    filter(activity_id == !!activity_id) %>%
    arrange(time) %>%
    mutate(
      timestamp = ymd_hms(time),
      elapsed_min = as.numeric(timestamp - min(timestamp)) / 60
    )

  # Downsample points for faster rendering (keep every 5th point for plots)
  # This significantly speeds up plotly rendering with minimal visual impact
  plot_points <- clean_points %>%
    mutate(point_num = row_number()) %>%
    filter(point_num %% 5 == 1 | point_num == n())  # Keep every 5th point + last point

  clean_segments <- denoised_segments %>%
    filter(activity_id == !!activity_id) %>%
    arrange(start_time) %>%
    mutate(
      timestamp = ymd_hms(start_time),
      end_timestamp = timestamp + time_delta_sec,
      elapsed_min = as.numeric(timestamp - min(timestamp)) / 60,
      # Calculate cumulative elevation gain
      elevation_gain = pmax(elevation_delta_ft, 0),
      cumulative_gain_ft = cumsum(elevation_gain)
    )

  # Add rest status to points by joining with segments
  # Each point falls within a segment's time range
  clean_points <- clean_points %>%
    rowwise() %>%
    mutate(
      # Find which segment this point belongs to
      is_rest = {
        seg_idx <- which(timestamp >= clean_segments$timestamp &
                        timestamp <= clean_segments$end_timestamp)
        if (length(seg_idx) > 0) clean_segments$is_rest[seg_idx[1]] else FALSE
      }
    ) %>%
    ungroup()

  # Downsample points with segment grouping for rest/active
  plot_points <- clean_points %>%
    mutate(point_num = row_number()) %>%
    filter(point_num %% 5 == 1 | point_num == n()) %>%
    # Add segment group for rest/active transitions
    mutate(
      rest_change = is_rest != lag(is_rest, default = FALSE),
      segment_group = cumsum(rest_change)
    )

  # Downsample segments for faster rendering
  plot_segments <- clean_segments %>%
    mutate(seg_num = row_number()) %>%
    filter(seg_num %% 5 == 1 | seg_num == n()) %>%  # Keep every 5th segment + last segment
    # Add segment group for rest/active transitions
    mutate(
      rest_change = is_rest != lag(is_rest, default = FALSE),
      segment_group = cumsum(rest_change)
    )

  # Get terrain sections for this activity and calculate time ranges
  activity_sections <- terrain_sections %>%
    filter(activity_id == !!activity_id) %>%
    mutate(
      section_start_time = ymd_hms(section_start_time),
      section_end_time = section_start_time + total_elapsed_time_sec,
      start_min = as.numeric(section_start_time - min(section_start_time)) / 60,
      end_min = start_min + (total_elapsed_time_sec / 60)
    )

  # Helper function to convert hex color to rgba
  hex_to_rgba <- function(hex_color, alpha = 0.1) {
    # Remove # if present
    hex_color <- gsub("#", "", hex_color)
    # Convert to RGB
    r <- strtoi(substr(hex_color, 1, 2), 16)
    g <- strtoi(substr(hex_color, 3, 4), 16)
    b <- strtoi(substr(hex_color, 5, 6), 16)
    # Return rgba string
    paste0("rgba(", r, ", ", g, ", ", b, ", ", alpha, ")")
  }

  # Terrain colors (semi-transparent for backgrounds) - from global parameters
  terrain_colors <- list(
    "climbing" = hex_to_rgba(color_climbing, 0.1),
    "flats" = hex_to_rgba(color_flats, 0.1),
    "descending" = hex_to_rgba(color_descending, 0.1)
  )

  # Create terrain shapes for background shading
  terrain_shapes <- lapply(seq_len(nrow(activity_sections)), function(i) {
    section <- activity_sections[i, ]
    list(
      type = "rect",
      xref = "x",
      yref = "paper",
      x0 = section$start_min,
      x1 = section$end_min,
      y0 = 0,
      y1 = 1,
      fillcolor = terrain_colors[[section$terrain_type]],
      line = list(width = 0),
      layer = "below"
    )
  })

  # Elevation plot - segmented by rest/active status
  elevation_plot <- plot_ly()

  # Add traces for each segment group (colored by rest/active)
  segment_groups <- plot_points %>%
    group_by(segment_group) %>%
    summarise(
      is_rest = first(is_rest),
      n_points = n(),
      .groups = "drop"
    ) %>%
    filter(n_points >= 2)  # Need at least 2 points for a line

  for (i in seq_len(nrow(segment_groups))) {
    seg <- segment_groups[i, ]
    seg_data <- plot_points %>% filter(segment_group == seg$segment_group)

    # Add first point of next segment to create continuous line
    if (i < nrow(segment_groups)) {
      next_seg <- segment_groups[i + 1, ]
      first_point_next <- plot_points %>%
        filter(segment_group == next_seg$segment_group) %>%
        slice(1)
      seg_data <- bind_rows(seg_data, first_point_next)
    }

    line_color <- if (seg$is_rest) color_rest else color_active

    elevation_plot <- elevation_plot %>%
      add_trace(
        data = seg_data,
        x = ~elapsed_min,
        y = ~elevation_ft,
        type = 'scatter',
        mode = 'lines',
        name = if (seg$is_rest) 'Rest' else 'Active',
        line = list(color = line_color, width = 2),
        showlegend = (i == 1 && !seg$is_rest) || (i <= nrow(segment_groups) && seg$is_rest && !any(segment_groups$is_rest[1:(i-1)])),  # Show legend once per type
        legendgroup = if (seg$is_rest) 'rest' else 'active',
        hovertemplate = paste(
          '<b>Elevation</b><br>',
          'Time: %{x:.1f} min<br>',
          'Elevation: %{y:.0f} ft<br>',
          'Status: ', if (seg$is_rest) 'Rest' else 'Active', '<br>',
          '<extra></extra>'
        )
      )
  }

  elevation_plot <- elevation_plot %>%
    layout(
      title = list(text = "Elevation Profile", font = list(size = 13)),
      xaxis = list(title = "Elapsed Time (minutes)", titlefont = list(size = 11)),
      yaxis = list(title = "Elevation (feet)", titlefont = list(size = 11)),
      hovermode = 'closest',
      margin = list(l = 50, r = 20, t = 35, b = 40),
      height = 191,
      shapes = terrain_shapes,
      showlegend = TRUE,
      legend = list(
        x = 0.02,
        y = 0.98,
        xanchor = 'left',
        yanchor = 'top',
        bgcolor = 'rgba(255, 255, 255, 0.8)',
        bordercolor = '#ccc',
        borderwidth = 1
      )
    )

  # Speed plot - segmented by rest/active status
  speed_plot <- plot_ly()

  # Add traces for each segment group (colored by rest/active)
  segment_groups_segs <- plot_segments %>%
    group_by(segment_group) %>%
    summarise(
      is_rest = first(is_rest),
      n_points = n(),
      .groups = "drop"
    ) %>%
    filter(n_points >= 2)

  for (i in seq_len(nrow(segment_groups_segs))) {
    seg <- segment_groups_segs[i, ]
    seg_data <- plot_segments %>% filter(segment_group == seg$segment_group)

    # Add first point of next segment to create continuous line
    if (i < nrow(segment_groups_segs)) {
      next_seg <- segment_groups_segs[i + 1, ]
      first_point_next <- plot_segments %>%
        filter(segment_group == next_seg$segment_group) %>%
        slice(1)
      seg_data <- bind_rows(seg_data, first_point_next)
    }

    line_color <- if (seg$is_rest) color_rest else color_active

    speed_plot <- speed_plot %>%
      add_trace(
        data = seg_data,
        x = ~elapsed_min,
        y = ~speed_mph,
        type = 'scatter',
        mode = 'lines',
        name = if (seg$is_rest) 'Rest' else 'Active',
        line = list(color = line_color, width = 2),
        showlegend = FALSE,  # Don't duplicate legend
        legendgroup = if (seg$is_rest) 'rest' else 'active',
        hovertemplate = paste(
          '<b>Speed</b><br>',
          'Time: %{x:.1f} min<br>',
          'Speed: %{y:.2f} mph<br>',
          'Status: ', if (seg$is_rest) 'Rest' else 'Active', '<br>',
          '<extra></extra>'
        )
      )
  }

  speed_plot <- speed_plot %>%
    layout(
      title = list(text = "Speed Over Time", font = list(size = 13)),
      xaxis = list(title = "Elapsed Time (minutes)", titlefont = list(size = 11)),
      yaxis = list(title = "Speed (mph)", titlefont = list(size = 11)),
      hovermode = 'closest',
      margin = list(l = 50, r = 20, t = 35, b = 40),
      height = 191,
      shapes = terrain_shapes
    )

  # Cumulative elevation gain plot - segmented by rest/active status
  elevation_gain_plot <- plot_ly()

  # Add traces for each segment group (colored by rest/active)
  for (i in seq_len(nrow(segment_groups_segs))) {
    seg <- segment_groups_segs[i, ]
    seg_data <- plot_segments %>% filter(segment_group == seg$segment_group)

    # Add first point of next segment to create continuous line
    if (i < nrow(segment_groups_segs)) {
      next_seg <- segment_groups_segs[i + 1, ]
      first_point_next <- plot_segments %>%
        filter(segment_group == next_seg$segment_group) %>%
        slice(1)
      seg_data <- bind_rows(seg_data, first_point_next)
    }

    line_color <- if (seg$is_rest) color_rest else color_active

    elevation_gain_plot <- elevation_gain_plot %>%
      add_trace(
        data = seg_data,
        x = ~elapsed_min,
        y = ~cumulative_gain_ft,
        type = 'scatter',
        mode = 'lines',
        name = if (seg$is_rest) 'Rest' else 'Active',
        line = list(color = line_color, width = 2),
        showlegend = FALSE,  # Don't duplicate legend
        legendgroup = if (seg$is_rest) 'rest' else 'active',
        hovertemplate = paste(
          '<b>Cumulative Elevation Gain</b><br>',
          'Time: %{x:.1f} min<br>',
          'Total Gain: %{y:.0f} ft<br>',
          'Status: ', if (seg$is_rest) 'Rest' else 'Active', '<br>',
          '<extra></extra>'
        )
      )
  }

  elevation_gain_plot <- elevation_gain_plot %>%
    layout(
      title = list(text = "Cumulative Elevation Gain", font = list(size = 13)),
      xaxis = list(title = "Elapsed Time (minutes)", titlefont = list(size = 11)),
      yaxis = list(title = "Cumulative Gain (feet)", titlefont = list(size = 11)),
      hovermode = 'closest',
      margin = list(l = 50, r = 20, t = 35, b = 40),
      height = 191,
      shapes = terrain_shapes
    )

  return(list(
    elevation = elevation_plot,
    speed = speed_plot,
    elevation_gain = elevation_gain_plot
  ))
}

## main processing ----

# Load data
message("Loading original and denoised data...")
long_points_data <- read.csv(file.path(clean_data_dir, "long_points_data.csv"))
denoised_points_data <- read.csv(file.path(clean_data_dir, "denoised_points_data.csv"))
denoised_segments_data <- read.csv(file.path(clean_data_dir, "denoised_segments_data.csv"))
activity_metadata <- read.csv(file.path(clean_data_dir, "activity_metadata.csv"))
distance_intervals <- read.csv(file.path(clean_data_dir, "distance_intervals.csv"))
terrain_sections <- read.csv(file.path(clean_data_dir, "terrain_sections.csv"))

message(paste("  Original points:", format(nrow(long_points_data), big.mark = ",")))
message(paste("  Denoised points:", format(nrow(denoised_points_data), big.mark = ",")))
message(paste("  Denoised segments:", format(nrow(denoised_segments_data), big.mark = ",")))
message(paste("  Distance intervals:", format(nrow(distance_intervals), big.mark = ",")))
message(paste("  Terrain sections:", format(nrow(terrain_sections), big.mark = ",")))

# Get list of activities with metadata (from denoised data - only show cleaned activities)
activities_info <- activity_metadata %>%
  filter(activity_id %in% unique(denoised_points_data$activity_id)) %>%
  arrange(desc(date)) %>%  # Sort by date, most recent first
  mutate(
    display_name = paste0(
      format(as.Date(date), "%Y-%m-%d"),
      " - ",
      ifelse(is.na(activity_name) | activity_name == "",
             paste("Activity", activity_id),
             activity_name)
    )
  )

message(paste("\nCreating visualizations for", nrow(activities_info), "activities..."))

# Calculate summary statistics for each activity
activity_summaries <- denoised_segments_data %>%
  group_by(activity_id) %>%
  summarise(
    total_distance_mi = sum(distance_3d_mi, na.rm = TRUE),
    total_elevation_gain_ft = sum(pmax(elevation_delta_ft, 0), na.rm = TRUE),
    total_time_hr = sum(time_delta_sec, na.rm = TRUE) / 3600,
    total_active_time_hr = sum(time_delta_sec[!is_rest], na.rm = TRUE) / 3600,
    .groups = "drop"
  )

# Prepare all climbing sections for comparative plots
all_climbs <- terrain_sections %>%
  filter(
    terrain_type == "climbing",
    net_elevation_change_ft > 0,
    section_distance_mi >= 0.15
  ) %>%
  mutate(
    # Calculate ascent rate (ft/hr)
    rate_of_ascent_ft_hr = if_else(
      active_time_sec > 0,
      elevation_gain_ft / (active_time_sec / 3600),
      NA_real_
    )
  ) %>%
  filter(!is.na(rate_of_ascent_ft_hr), rate_of_ascent_ft_hr > 0)

# Create maps and plots for each activity
activity_maps <- list()
activity_plots <- list()
activity_comparative_plots <- list()

for (i in seq_len(nrow(activities_info))) {
  activity_id <- activities_info$activity_id[i]
  display_name <- activities_info$display_name[i]

  message(paste0("  [", i, "/", nrow(activities_info), "] Creating visualizations for ", display_name))

  # Create map
  activity_maps[[as.character(activity_id)]] <- create_activity_map(
    long_points_data,
    denoised_points_data,
    terrain_sections,
    distance_intervals,
    activity_id
  )

  # Create time series plots
  activity_plots[[as.character(activity_id)]] <- create_activity_plots(
    denoised_points_data,
    denoised_segments_data,
    terrain_sections,
    activity_id
  )

  # Create comparative scatter plots
  current_climbs <- all_climbs %>% filter(activity_id == !!activity_id)

  # Plot 1: Climb Difficulty (Distance vs Elevation)
  comp_plot1 <- plot_ly() %>%
    add_trace(
      data = all_climbs,
      x = ~section_distance_mi,
      y = ~elevation_gain_ft,
      type = 'scatter',
      mode = 'markers',
      marker = list(color = '#808080', size = 6, opacity = 0.6),
      name = 'All Climbs',
      hovertemplate = paste(
        '<b>All Activities</b><br>',
        'Distance: %{x:.2f} mi<br>',
        'Elevation: %{y:.0f} ft<br>',
        '<extra></extra>'
      )
    ) %>%
    add_trace(
      data = current_climbs,
      x = ~section_distance_mi,
      y = ~elevation_gain_ft,
      type = 'scatter',
      mode = 'markers',
      marker = list(color = color_climbing, size = 10, opacity = 0.9, symbol = 'diamond'),
      name = 'This Activity',
      hovertemplate = paste(
        '<b>This Activity</b><br>',
        'Distance: %{x:.2f} mi<br>',
        'Elevation: %{y:.0f} ft<br>',
        '<extra></extra>'
      )
    ) %>%
    layout(
      title = list(text = "Climb Difficulty", font = list(size = 14)),
      xaxis = list(title = "Distance (miles)", titlefont = list(size = 11)),
      yaxis = list(title = "Elevation Gain (feet)", titlefont = list(size = 11)),
      hovermode = 'closest',
      height = 380,
      margin = list(l = 60, r = 20, t = 50, b = 50),
      showlegend = TRUE,
      legend = list(x = 0.02, y = 0.98, bgcolor = 'rgba(255,255,255,0.8)')
    )

  # Plot 2: Climb Intensity (Grade vs Ascent Rate)
  comp_plot2 <- plot_ly() %>%
    add_trace(
      data = all_climbs,
      x = ~calculated_grade_percent,
      y = ~rate_of_ascent_ft_hr,
      type = 'scatter',
      mode = 'markers',
      marker = list(color = '#808080', size = 6, opacity = 0.6),
      name = 'All Climbs',
      hovertemplate = paste(
        '<b>All Activities</b><br>',
        'Grade: %{x:.1f}%<br>',
        'Ascent Rate: %{y:.0f} ft/hr<br>',
        '<extra></extra>'
      )
    ) %>%
    add_trace(
      data = current_climbs,
      x = ~calculated_grade_percent,
      y = ~rate_of_ascent_ft_hr,
      type = 'scatter',
      mode = 'markers',
      marker = list(color = color_climbing, size = 10, opacity = 0.9, symbol = 'diamond'),
      name = 'This Activity',
      hovertemplate = paste(
        '<b>This Activity</b><br>',
        'Grade: %{x:.1f}%<br>',
        'Ascent Rate: %{y:.0f} ft/hr<br>',
        '<extra></extra>'
      )
    ) %>%
    layout(
      title = list(text = "Climb Intensity", font = list(size = 14)),
      xaxis = list(title = "Average Grade (%)", titlefont = list(size = 11)),
      yaxis = list(title = "Ascent Rate (ft/hr)", titlefont = list(size = 11)),
      hovermode = 'closest',
      height = 380,
      margin = list(l = 60, r = 20, t = 50, b = 50),
      showlegend = TRUE,
      legend = list(x = 0.02, y = 0.98, bgcolor = 'rgba(255,255,255,0.8)')
    )

  activity_comparative_plots[[as.character(activity_id)]] <- list(
    difficulty = comp_plot1,
    intensity = comp_plot2
  )
}

# Build HTML interface with dropdown
message("\nBuilding HTML interface...")

# Create dropdown selector
activity_selector <- tags$div(
  class = "form-group",
  style = "margin-bottom: 20px;",
  tags$label(
    `for` = "activitySelector",
    "Select Activity:",
    style = "font-weight: bold; margin-right: 10px; font-size: 16px;"
  ),
  tags$select(
    class = "form-select",
    id = "activitySelector",
    style = "display: inline-block; width: auto; max-width: 600px;",
    onchange = "showActivity(this.value)",
    lapply(seq_len(nrow(activities_info)), function(i) {
      activity_id <- activities_info$activity_id[i]
      display_name <- activities_info$display_name[i]

      tags$option(
        value = activity_id,
        selected = if (i == 1) "selected" else NULL,
        display_name
      )
    })
  )
)

# Create activity content panels
activity_content <- tags$div(
  id = "activityContent",
  lapply(seq_len(nrow(activities_info)), function(i) {
    activity_id <- activities_info$activity_id[i]
    is_first <- i == 1

    plots <- activity_plots[[as.character(activity_id)]]

    tags$div(
      class = "activity-panel",
      id = paste0("content-", activity_id),
      style = if (is_first) "display: block;" else "display: none;",

      # Summary statistics cards
      tags$div(
        class = "row",
        style = "margin: 20px 0;",
        lapply(1:4, function(stat_idx) {
          summary_stats <- activity_summaries %>% filter(activity_id == !!activity_id)

          stat_info <- switch(stat_idx,
            list(label = "Total Distance", value = sprintf("%.2f mi", summary_stats$total_distance_mi)),
            list(label = "Total Elevation Gain", value = sprintf("%.0f ft", summary_stats$total_elevation_gain_ft)),
            list(label = "Total Time", value = sprintf("%.2f hr", summary_stats$total_time_hr)),
            list(label = "Active Time", value = sprintf("%.2f hr", summary_stats$total_active_time_hr))
          )

          tags$div(
            class = "col-md-3",
            tags$div(
              class = "stat-card",
              style = "background: white; border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);",
              tags$div(
                style = "font-size: 12px; color: #666; font-weight: 500; margin-bottom: 5px; text-transform: uppercase;",
                stat_info$label
              ),
              tags$div(
                style = "font-size: 24px; font-weight: bold; color: #333;",
                stat_info$value
              )
            )
          )
        })
      ),

      # Two-column layout: map on left, plots on right
      tags$div(
        class = "row",
        style = "margin-top: 10px;",

        # Left column: Map
        tags$div(
          class = "col-md-6",
          tags$div(
            style = "height: 591px; width: 100%;",
            activity_maps[[as.character(activity_id)]]
          )
        ),

        # Right column: Stacked plots
        tags$div(
          class = "col-md-6",

          # Elevation plot
          tags$div(
            style = "height: 191px; margin-bottom: 10px;",
            plots$elevation
          ),

          # Speed plot
          tags$div(
            style = "height: 191px; margin-bottom: 10px;",
            plots$speed
          ),

          # Elevation gain plot
          tags$div(
            style = "height: 191px;",
            plots$elevation_gain
          )
        )
      ),

      # Section Summary Table
      tags$div(
        style = "margin-top: 30px;",
        tags$h4("Section Summary", style = "margin-bottom: 15px;"),
        tags$div(
          class = "table-responsive",
          {
            # Get sections for this activity
            activity_sections <- terrain_sections %>%
              filter(activity_id == !!activity_id) %>%
              arrange(section_id) %>%
              mutate(
                # Calculate rate of ascent (ft/hr) for climbing sections
                rate_of_ascent_ft_hr = if_else(
                  terrain_type == "climbing" & total_elapsed_time_sec > 0,
                  (elevation_gain_ft / (total_elapsed_time_sec / 3600)),
                  NA_real_
                ),
                # Format percentage active
                pct_active = 100 - pct_time_resting
              )

            # Calculate max distance for relative bar width
            max_distance <- max(activity_sections$section_distance_mi, na.rm = TRUE)

            # Create HTML table
            tags$table(
              class = "table table-bordered table-sm",
              style = "font-size: 14px;",
              tags$thead(
                style = "background-color: #f8f9fa;",
                tags$tr(
                  tags$th("Type", style = "text-align: left;"),
                  tags$th("Relative Distance", style = "text-align: left; width: 150px;"),
                  tags$th("Distance (mi)", style = "text-align: right;"),
                  tags$th("Net Elev (ft)", style = "text-align: right;"),
                  tags$th("Avg Grade (%)", style = "text-align: right;"),
                  tags$th("Total Time (min)", style = "text-align: right;"),
                  tags$th("Active Time (min)", style = "text-align: right;"),
                  tags$th("% Active", style = "text-align: right;"),
                  tags$th("Avg Speed (mph)", style = "text-align: right;"),
                  tags$th("Ascent Rate (ft/hr)", style = "text-align: right;")
                )
              ),
              tags$tbody(
                lapply(seq_len(nrow(activity_sections)), function(row_idx) {
                  row_data <- activity_sections[row_idx, ]

                  # Color code by terrain type
                  bg_color <- switch(row_data$terrain_type,
                    "climbing" = "rgba(255, 140, 0, 0.1)",
                    "descending" = "rgba(50, 205, 50, 0.1)",
                    "flats" = "rgba(65, 105, 225, 0.1)",
                    "white"
                  )

                  # Bar fill color (solid, not transparent)
                  bar_color <- switch(row_data$terrain_type,
                    "climbing" = color_climbing,
                    "descending" = color_descending,
                    "flats" = color_flats,
                    color_flats
                  )

                  # Calculate relative width as percentage
                  bar_width_pct <- (row_data$section_distance_mi / max_distance) * 100

                  tags$tr(
                    style = paste0("background-color: ", bg_color, ";"),
                    tags$td(tools::toTitleCase(row_data$terrain_type), style = "text-align: left; font-weight: 500;"),
                    # Relative distance bar
                    tags$td(
                      style = "text-align: left; padding: 4px;",
                      tags$div(
                        style = paste0(
                          "width: ", bar_width_pct, "%; ",
                          "height: 20px; ",
                          "background-color: ", bar_color, "; ",
                          "border-radius: 3px; ",
                          "min-width: 2px;"
                        )
                      )
                    ),
                    tags$td(sprintf("%.2f", row_data$section_distance_mi), style = "text-align: right;"),
                    tags$td(sprintf("%.0f", row_data$net_elevation_change_ft), style = "text-align: right;"),
                    tags$td(sprintf("%.1f", row_data$calculated_grade_percent), style = "text-align: right;"),
                    tags$td(sprintf("%.1f", row_data$total_elapsed_time_min), style = "text-align: right;"),
                    tags$td(sprintf("%.1f", row_data$active_time_min), style = "text-align: right;"),
                    tags$td(sprintf("%.0f%%", row_data$pct_active), style = "text-align: right;"),
                    tags$td(sprintf("%.2f", row_data$avg_speed_mph), style = "text-align: right;"),
                    tags$td(
                      if (!is.na(row_data$rate_of_ascent_ft_hr)) {
                        sprintf("%.0f", row_data$rate_of_ascent_ft_hr)
                      } else {
                        "-"
                      },
                      style = "text-align: right;"
                    )
                  )
                })
              )
            )
          }
        )
      ),

      # Comparative scatter plots
      tags$div(
        style = "margin-top: 40px;",
        tags$h4("Climb Comparison", style = "margin-bottom: 20px;"),
        tags$div(
          class = "row",

          # Climb Difficulty plot
          tags$div(
            class = "col-md-6",
            tags$div(
              style = "padding: 10px; background: white; border: 1px solid #e0e0e0; border-radius: 6px;",
              activity_comparative_plots[[as.character(activity_id)]]$difficulty
            )
          ),

          # Climb Intensity plot
          tags$div(
            class = "col-md-6",
            tags$div(
              style = "padding: 10px; background: white; border: 1px solid #e0e0e0; border-radius: 6px;",
              activity_comparative_plots[[as.character(activity_id)]]$intensity
            )
          )
        )
      )
    )
  })
)

# Combine into full page
html_page <- tags$html(
  tags$head(
    tags$title("Activity Summary"),
    tags$meta(charset = "utf-8"),
    tags$meta(name = "viewport", content = "width=device-width, initial-scale=1"),
    # Bootstrap CSS
    tags$link(
      rel = "stylesheet",
      href = "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css"
    ),
    # Custom CSS
    tags$style(HTML("
      body {
        padding: 20px;
        background-color: #f5f5f5;
      }
      .container-fluid {
        max-width: 1400px;
        margin: 0 auto;
        background-color: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      h1 {
        margin-bottom: 20px;
        color: #333;
      }
      .form-select {
        padding: 8px 12px;
        font-size: 15px;
        border: 2px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
      }
      .form-select:focus {
        border-color: #0056b3;
        outline: none;
        box-shadow: 0 0 0 0.2rem rgba(0,86,179,0.25);
      }
      .activity-panel {
        margin-top: 20px;
      }
      .leaflet-container {
        border-radius: 4px;
      }
    ")),
    # JavaScript for dropdown functionality
    tags$script(HTML("
      function showActivity(activityId) {
        // Hide all panels
        var panels = document.getElementsByClassName('activity-panel');
        for (var i = 0; i < panels.length; i++) {
          panels[i].style.display = 'none';
        }
        // Show selected panel
        var selectedPanel = document.getElementById('content-' + activityId);
        selectedPanel.style.display = 'block';

        // Fix Leaflet map rendering by triggering resize after panel is visible
        setTimeout(function() {
          window.dispatchEvent(new Event('resize'));

          // Also try HTMLWidgets resize if available
          if (window.HTMLWidgets && window.HTMLWidgets.resize) {
            window.HTMLWidgets.resize();
          }
        }, 50);
      }
    "))
  ),
  tags$body(
    tags$div(
      class = "container-fluid",
      tags$h1("Activity Summary"),
      tags$p(
        class = "lead",
        style = "color: #666; margin-bottom: 25px;",
        "Trace Cleaning and Section Analysis"
      ),
      activity_selector,
      activity_content
    ),
    # Bootstrap JS
    tags$script(
      src = "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"
    )
  )
)

# Save to file
output_file <- file.path(validation_dir, "cleaning_validation.html")
message(paste("\nSaving HTML file to:", output_file))

save_html(html_page, file = output_file)

message("\n=== Stage 3 Complete ===")
message(paste("Validation HTML created with", length(activities), "activity tabs"))
message(paste("Open in browser:", output_file))
message("\nTo view:")
message(paste0('  browseURL("', output_file, '")'))
