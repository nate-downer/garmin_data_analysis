## Time Prediction for New Route
## Takes a GPX file, processes it, and predicts section completion times

message("\n=== Stage 7: Route Time Prediction ===\n")

## Configuration ----

# Route to predict (uses test_route from global params)
prediction_route <- test_route
message(paste("Predicting time for route:", prediction_route))

# Safety check: ensure we're not accidentally processing the full dataset
if (grepl("full_data", prediction_route, ignore.case = TRUE)) {
  stop("ERROR: Cannot run predictions on full_data directory. Use a test_route instead.")
}

# Check if route exists
if (!dir.exists(prediction_route)) {
  stop(paste("Route directory not found:", prediction_route))
}

# Get GPX files from route directory
gpx_files <- list.files(prediction_route, pattern = "\\.gpx$", full.names = TRUE)

if (length(gpx_files) == 0) {
  stop(paste("No GPX files found in:", prediction_route))
}

message(paste("  Found", length(gpx_files), "GPX file(s)"))

# Only process the first GPX file (for single route prediction)
if (length(gpx_files) > 1) {
  message(paste("  Note: Multiple GPX files found. Processing only the first:", basename(gpx_files[1])))
}

## Load saved models ----

message("\nLoading trained models...")

climb_model <- readRDS(file.path(models_dir, "climb_time_model.rds"))
flats_model <- readRDS(file.path(models_dir, "flats_time_model.rds"))
descent_model <- readRDS(file.path(models_dir, "descent_time_model.rds"))
rest_model <- readRDS(file.path(models_dir, "rest_time_model.rds"))

message("  ✓ Models loaded")

# Debug: Check model structure
if (!is.null(climb_model$xlevels$activity_type)) {
  message(paste("  Available activity types in model:",
                paste(levels(climb_model$xlevels$activity_type), collapse = ", ")))
} else {
  message("  Note: Models do not include activity_type factor")
}

## Load historical climb data for comparison ----

message("\nLoading historical data for comparison...")

terrain_sections <- read.csv(file.path(clean_data_dir, "terrain_sections.csv"))
activity_metadata <- read.csv(file.path(clean_data_dir, "activity_metadata.csv"))

# Prepare comparison climbs
all_climbs <- terrain_sections %>%
  filter(
    terrain_type == "climbing",
    net_elevation_change_ft > 0,
    section_distance_mi >= 0.15
  ) %>%
  mutate(
    climb_pace_min_mi = if_else(
      section_distance_mi > 0,
      active_time_min / section_distance_mi,
      NA_real_
    ),
    rate_of_ascent_ft_hr = if_else(
      active_time_sec > 0,
      elevation_gain_ft / (active_time_sec / 3600),
      NA_real_
    )
  ) %>%
  filter(!is.na(climb_pace_min_mi), climb_pace_min_mi > 0)

## Process route GPX file ----

message("\nProcessing route GPX file...")

# Process the first GPX file (assuming one route per directory)
route_gpx <- gpx_files[1]
route_name <- basename(prediction_route)  # Use folder name instead of GPX filename

# Create display name (convert underscores to spaces and title-case)
route_display_name <- gsub("_", " ", route_name) %>%
  tools::toTitleCase()

message(paste("  Processing:", route_display_name))

# Extract route data using parse_gpx_file (which only takes filepath)
route_points <- parse_gpx_file(route_gpx)

# Check if parsing was successful
if (nrow(route_points) == 0) {
  stop(paste("Failed to parse GPX file or no trackpoints found in:", route_gpx))
}

# If activity_id extraction failed (non-standard filename), use route name
if (is.na(route_points$activity_id[1]) || route_points$activity_id[1] == "") {
  message("  Note: Using route name as activity_id (filename doesn't match 'activity_*.gpx' pattern)")
  route_points <- route_points %>%
    mutate(activity_id = route_name)
}

# Calculate segments
route_segments <- calculate_segments(route_points)

# Verify segments were created
if (nrow(route_segments) == 0) {
  stop("Failed to create segments from route points")
}

# Add timezone and local time (use first point's location)
first_lat <- route_points$lat[1]
first_lon <- route_points$lon[1]
route_tz <- tz_lookup_coords(first_lat, first_lon, method = "accurate", warn = FALSE)

route_points <- route_points %>%
  mutate(
    timezone = route_tz,
    time_local = with_tz(ymd_hms(time, tz = "UTC"), route_tz)
  )

route_segments <- route_segments %>%
  mutate(
    timezone = route_tz,
    start_time_local_dt = with_tz(ymd_hms(start_time, tz = "UTC"), route_tz),
    end_time_local_dt = with_tz(ymd_hms(end_time, tz = "UTC"), route_tz),
    start_time_local = format(start_time_local_dt, "%Y-%m-%d %H:%M:%S"),
    end_time_local = format(end_time_local_dt, "%Y-%m-%d %H:%M:%S"),
    start_hour_local = hour(start_time_local_dt)
  ) %>%
  select(-start_time_local_dt, -end_time_local_dt)

message(paste("  Points:", nrow(route_points)))
message(paste("  Segments:", nrow(route_segments)))

## Create distance intervals and terrain sections ----

message("\nCreating distance intervals and terrain sections...")

# Create distance intervals (using logic from 03_distance_intervals.R)
route_intervals <- route_segments %>%
  mutate(
    cumulative_distance_mi = cumsum(distance_3d_mi),
    distance_interval = floor(cumulative_distance_mi / distance_interval_mi)
  ) %>%
  group_by(distance_interval) %>%
  summarise(
    interval_distance_mi = sum(distance_3d_mi, na.rm = TRUE),
    cumulative_distance_mi = first(cumulative_distance_mi),

    elevation_gain_ft = sum(elevation_delta_ft[elevation_delta_ft > 0], na.rm = TRUE),
    elevation_loss_ft = abs(sum(elevation_delta_ft[elevation_delta_ft < 0], na.rm = TRUE)),
    net_elevation_change_ft = sum(elevation_delta_ft, na.rm = TRUE),
    start_elevation_ft = first(start_elevation_ft),
    end_elevation_ft = last(end_elevation_ft),

    calculated_grade_percent = if_else(
      interval_distance_mi > 0,
      (net_elevation_change_ft / (interval_distance_mi * 5280)) * 100,
      0
    ),

    .groups = "drop"
  )

# Classify terrain
route_intervals <- route_intervals %>%
  mutate(
    rolling_avg_elevation_change = rollmean(
      net_elevation_change_ft,
      k = min(terrain_rolling_intervals, n()),
      fill = NA,
      align = "center"
    ),
    rolling_avg_elevation_change = if_else(
      is.na(rolling_avg_elevation_change),
      net_elevation_change_ft,
      rolling_avg_elevation_change
    ),
    terrain_type = case_when(
      rolling_avg_elevation_change > terrain_climb_threshold_ft ~ "climbing",
      rolling_avg_elevation_change < terrain_descent_threshold_ft ~ "descending",
      TRUE ~ "flats"
    )
  )

# Aggregate into terrain sections
route_sections <- route_intervals %>%
  mutate(
    terrain_change = terrain_type != lag(terrain_type, default = ""),
    section_id = cumsum(terrain_change)
  ) %>%
  group_by(section_id) %>%
  summarise(
    terrain_type = first(terrain_type),
    section_start_interval = first(distance_interval),
    section_end_interval = last(distance_interval),
    n_intervals = n(),

    section_distance_mi = sum(interval_distance_mi, na.rm = TRUE),
    elevation_gain_ft = sum(elevation_gain_ft, na.rm = TRUE),
    elevation_loss_ft = sum(elevation_loss_ft, na.rm = TRUE),
    net_elevation_change_ft = sum(net_elevation_change_ft, na.rm = TRUE),
    start_elevation_ft = first(start_elevation_ft),
    end_elevation_ft = last(end_elevation_ft),

    calculated_grade_percent = if_else(
      section_distance_mi > 0,
      (net_elevation_change_ft / (section_distance_mi * 5280)) * 100,
      0
    ),

    .groups = "drop"
  )

message(paste("  Intervals:", nrow(route_intervals)))
message(paste("  Sections:", nrow(route_sections)))
message(paste("    Climbing:", sum(route_sections$terrain_type == "climbing")))
message(paste("    Flats:", sum(route_sections$terrain_type == "flats")))
message(paste("    Descending:", sum(route_sections$terrain_type == "descending")))

## Predict times for each section ----

message("\nPredicting section times...")

# Add features needed for prediction
# Use global parameters from init script
route_sections <- route_sections %>%
  mutate(
    # Use configured start time
    start_hour = prediciton_start_time_of_day_h,

    # Calculate cumulative metrics as route progresses
    cumulative_time_min = 0,  # Will be updated after predictions
    cumulative_elevation_gain_ft = cumsum(lag(elevation_gain_ft, default = 0)),

    # Log grade
    log_abs_grade = log1p(abs(calculated_grade_percent))
  )

# Add activity type with proper factor levels
# Check if the model has activity_type factor levels
if (is.null(climb_model$xlevels$activity_type)) {
  # Model doesn't have activity_type, use the configured type as-is
  message("  Note: Model doesn't have activity_type factor levels, using configured type")
  route_sections <- route_sections %>%
    mutate(activity_type = prediction_activity_type)
} else {
  # Model has activity type, ensure compatibility
  valid_activity_types <- levels(climb_model$xlevels$activity_type)

  if (length(valid_activity_types) == 0) {
    message("  Warning: Model has empty activity type levels, using configured type")
    route_sections <- route_sections %>%
      mutate(activity_type = prediction_activity_type)
  } else if (!(prediction_activity_type %in% valid_activity_types)) {
    message(paste("  Warning: Activity type '", prediction_activity_type,
                  "' not found in model. Available types:", paste(valid_activity_types, collapse = ", ")))
    message(paste("  Using first available type:", valid_activity_types[1]))
    activity_type_to_use <- valid_activity_types[1]
    route_sections <- route_sections %>%
      mutate(activity_type = factor(activity_type_to_use, levels = valid_activity_types))
  } else {
    route_sections <- route_sections %>%
      mutate(activity_type = factor(prediction_activity_type, levels = valid_activity_types))
  }
}

# Predict times for each section
predicted_times <- numeric(nrow(route_sections))

for (i in seq_len(nrow(route_sections))) {
  section <- route_sections[i, ]

  # Select model based on terrain type
  model <- switch(section$terrain_type,
    "climbing" = climb_model,
    "flats" = flats_model,
    "descending" = descent_model,
    flats_model  # default
  )

  # Predict time
  predicted_time <- predict(model, newdata = section)
  predicted_times[i] <- predicted_time

  # Update cumulative time for next section
  if (i < nrow(route_sections)) {
    route_sections$cumulative_time_min[i + 1] <- sum(predicted_times[1:i])
  }
}

# Add predictions to sections
route_sections <- route_sections %>%
  mutate(
    predicted_active_time_min = predicted_times,
    predicted_active_time_hr = predicted_active_time_min / 60
  )

message(paste("  Total predicted active time:", sprintf("%.1f", sum(predicted_times)), "minutes"))
message(paste("  Total predicted active time:", sprintf("%.2f", sum(predicted_times) / 60), "hours"))

## Calculate route summary ----

route_summary <- tibble(
  route_name = route_name,
  total_distance_mi = sum(route_sections$section_distance_mi),
  total_elevation_gain_ft = sum(route_sections$elevation_gain_ft),
  total_elevation_loss_ft = sum(route_sections$elevation_loss_ft),
  net_elevation_change_ft = sum(route_sections$net_elevation_change_ft),
  start_elevation_ft = route_sections$start_elevation_ft[1],
  end_elevation_ft = route_sections$end_elevation_ft[nrow(route_sections)],
  predicted_active_time_min = sum(route_sections$predicted_active_time_min),
  predicted_active_time_hr = predicted_active_time_min / 60,
  n_sections = nrow(route_sections),
  n_climb_sections = sum(route_sections$terrain_type == "climbing"),
  n_flat_sections = sum(route_sections$terrain_type == "flats"),
  n_descent_sections = sum(route_sections$terrain_type == "descending")
)

## Predict rest time ----

message("\nPredicting rest time...")

# Prepare data for rest model prediction
rest_input <- tibble(
  total_distance_mi = route_summary$total_distance_mi,
  total_elevation_gain_ft = route_summary$total_elevation_gain_ft,
  total_net_elevation_change_ft = route_summary$net_elevation_change_ft,
  total_active_time_min = route_summary$predicted_active_time_min,
  activity_type = factor(prediction_activity_type, levels = levels(rest_model$model$activity_type))
)

# Predict rest time
predicted_rest_time_min <- predict(rest_model, newdata = rest_input)

# Add to summary
route_summary <- route_summary %>%
  mutate(
    predicted_rest_time_min = predicted_rest_time_min,
    predicted_rest_time_hr = predicted_rest_time_min / 60,
    predicted_total_time_min = predicted_active_time_min + predicted_rest_time_min,
    predicted_total_time_hr = predicted_total_time_min / 60
  )

message(paste("  Predicted rest time:", sprintf("%.1f", predicted_rest_time_min), "minutes"))
message(paste("  Predicted total time:", sprintf("%.2f", route_summary$predicted_total_time_hr), "hours"))

## Create time-series data for plots ----

message("\nPreparing time-series data...")

# Create time points for each section (start and end)
plot_data <- route_sections %>%
  mutate(
    # Cumulative time at start of section
    start_time_min = cumsum(lag(predicted_active_time_min, default = 0)),
    # Cumulative time at end of section
    end_time_min = start_time_min + predicted_active_time_min,

    # Cumulative elevation gain
    cumulative_gain_start = cumsum(lag(elevation_gain_ft, default = 0)),
    cumulative_gain_end = cumulative_gain_start + elevation_gain_ft
  )

# Create individual plot data for each section (start and end points)
# For speed plot: need points ordered by section to create flat segments
plot_points_speed <- bind_rows(
  lapply(seq_len(nrow(plot_data)), function(i) {
    section <- plot_data[i, ]
    # Average speed for this section
    section_speed <- section$section_distance_mi / (section$predicted_active_time_min / 60)

    tibble(
      section_id = section$section_id,
      terrain_type = section$terrain_type,
      elapsed_min = c(section$start_time_min, section$end_time_min),
      speed_mph = c(section_speed, section_speed)
    )
  })
)

# For elevation and cumulative gain plots: arrange by time
plot_points <- bind_rows(
  plot_data %>%
    transmute(
      section_id,
      terrain_type,
      elapsed_min = start_time_min,
      elevation_ft = start_elevation_ft,
      cumulative_gain_ft = cumulative_gain_start
    ),
  plot_data %>%
    transmute(
      section_id,
      terrain_type,
      elapsed_min = end_time_min,
      elevation_ft = end_elevation_ft,
      cumulative_gain_ft = cumulative_gain_end
    )
) %>%
  arrange(elapsed_min)

## Create visualizations ----

message("\nGenerating visualizations...")

# Create terrain background shapes for plots
terrain_shapes <- lapply(seq_len(nrow(plot_data)), function(i) {
  section <- plot_data[i, ]

  fill_color <- switch(section$terrain_type,
    "climbing" = sprintf("rgba(%d, %d, %d, 0.1)",
                         strtoi(substr(gsub("#", "", color_climbing), 1, 2), 16),
                         strtoi(substr(gsub("#", "", color_climbing), 3, 4), 16),
                         strtoi(substr(gsub("#", "", color_climbing), 5, 6), 16)),
    "flats" = sprintf("rgba(%d, %d, %d, 0.1)",
                      strtoi(substr(gsub("#", "", color_flats), 1, 2), 16),
                      strtoi(substr(gsub("#", "", color_flats), 3, 4), 16),
                      strtoi(substr(gsub("#", "", color_flats), 5, 6), 16)),
    "descending" = sprintf("rgba(%d, %d, %d, 0.1)",
                          strtoi(substr(gsub("#", "", color_descending), 1, 2), 16),
                          strtoi(substr(gsub("#", "", color_descending), 3, 4), 16),
                          strtoi(substr(gsub("#", "", color_descending), 5, 6), 16)),
    "rgba(128, 128, 128, 0.1)"
  )

  list(
    type = "rect",
    xref = "x",
    yref = "paper",
    x0 = section$start_time_min,
    x1 = section$end_time_min,
    y0 = 0,
    y1 = 1,
    fillcolor = fill_color,
    line = list(width = 0),
    layer = "below"
  )
})

# Plot 1: Elevation over time
elevation_plot <- plot_ly(plot_points, x = ~elapsed_min, y = ~elevation_ft, type = 'scatter',
                          mode = 'lines', line = list(color = '#000000', width = 2),
                          hovertemplate = paste('<b>Elevation</b><br>',
                                              'Time: %{x:.1f} min<br>',
                                              'Elevation: %{y:.0f} ft<br>',
                                              '<extra></extra>')) %>%
  layout(
    title = list(text = "Elevation Profile", font = list(size = 13)),
    xaxis = list(title = "Elapsed Time (minutes)", titlefont = list(size = 11)),
    yaxis = list(title = "Elevation (feet)", titlefont = list(size = 11)),
    hovermode = 'closest',
    height = 191,
    margin = list(l = 60, r = 20, t = 35, b = 40),
    shapes = terrain_shapes,
    showlegend = FALSE
  )

# Plot 2: Speed over time
speed_plot <- plot_ly(plot_points_speed, x = ~elapsed_min, y = ~speed_mph, type = 'scatter',
                      mode = 'lines', line = list(color = '#000000', width = 2),
                      hovertemplate = paste('<b>Speed</b><br>',
                                          'Time: %{x:.1f} min<br>',
                                          'Speed: %{y:.2f} mph<br>',
                                          '<extra></extra>')) %>%
  layout(
    title = list(text = "Predicted Speed", font = list(size = 13)),
    xaxis = list(title = "Elapsed Time (minutes)", titlefont = list(size = 11)),
    yaxis = list(title = "Speed (mph)", titlefont = list(size = 11)),
    hovermode = 'closest',
    height = 191,
    margin = list(l = 60, r = 20, t = 35, b = 40),
    shapes = terrain_shapes,
    showlegend = FALSE
  )

# Plot 3: Cumulative elevation gain
elevation_gain_plot <- plot_ly(plot_points, x = ~elapsed_min, y = ~cumulative_gain_ft, type = 'scatter',
                                mode = 'lines', line = list(color = '#000000', width = 2),
                                hovertemplate = paste('<b>Cumulative Elevation Gain</b><br>',
                                                    'Time: %{x:.1f} min<br>',
                                                    'Total Gain: %{y:.0f} ft<br>',
                                                    '<extra></extra>')) %>%
  layout(
    title = list(text = "Cumulative Elevation Gain", font = list(size = 13)),
    xaxis = list(title = "Elapsed Time (minutes)", titlefont = list(size = 11)),
    yaxis = list(title = "Cumulative Gain (feet)", titlefont = list(size = 11)),
    hovermode = 'closest',
    height = 191,
    margin = list(l = 60, r = 20, t = 35, b = 40),
    shapes = terrain_shapes,
    showlegend = FALSE
  )

# Create route map with terrain-colored sections
route_map <- leaflet(height = 591) %>%
  addTiles()

# Assign terrain type to points using proportional mapping
total_intervals <- max(route_intervals$distance_interval) + 1
total_points <- nrow(route_points)

# Calculate proportional breakpoints
interval_proportions <- cumsum(route_sections$n_intervals) / sum(route_sections$n_intervals)
break_points <- c(0, round(interval_proportions * total_points))

# Ensure break points are valid
break_points <- unique(pmin(break_points, total_points))
if (break_points[length(break_points)] < total_points) {
  break_points[length(break_points)] <- total_points
}

# Assign terrain type to each point
route_points_with_terrain <- route_points %>%
  arrange(time) %>%
  mutate(
    section_id = cut(
      row_number(),
      breaks = break_points,
      labels = FALSE,
      include.lowest = TRUE,
      right = TRUE
    ),
    section_id = if_else(is.na(section_id), 1L, as.integer(section_id)),
    section_id = pmin(section_id, nrow(route_sections)),
    terrain_type = route_sections$terrain_type[section_id]
  )

# Add section group for continuous segments
route_points_with_terrain <- route_points_with_terrain %>%
  mutate(
    terrain_change = terrain_type != lag(terrain_type, default = ""),
    segment_group = cumsum(terrain_change)
  )

# Draw separate polylines for each continuous terrain segment
segment_groups <- route_points_with_terrain %>%
  group_by(segment_group, terrain_type) %>%
  summarise(n = n(), .groups = "drop") %>%
  filter(n >= 2)  # Need at least 2 points for a line

for (i in seq_len(nrow(segment_groups))) {
  seg <- segment_groups[i, ]
  seg_data <- route_points_with_terrain %>%
    filter(segment_group == seg$segment_group)

  if (nrow(seg_data) > 1) {
    color <- switch(seg$terrain_type,
      "climbing" = color_climbing,
      "flats" = color_flats,
      "descending" = color_descending,
      color_flats
    )

    route_map <- route_map %>%
      addPolylines(
        data = seg_data,
        lng = ~lon,
        lat = ~lat,
        color = color,
        weight = 4,
        opacity = 0.8,
        group = paste(tools::toTitleCase(seg$terrain_type), "Sections")
      )
  }
}

# Fit bounds to route
route_map <- route_map %>%
  fitBounds(
    lng1 = min(route_points$lon),
    lat1 = min(route_points$lat),
    lng2 = max(route_points$lon),
    lat2 = max(route_points$lat)
  ) %>%
  addLayersControl(
    overlayGroups = c("Climbing Sections", "Flats Sections", "Descending Sections"),
    options = layersControlOptions(collapsed = FALSE)
  )

# Create comparative scatter plots
# Plot 1: Climb Difficulty
route_climbs <- route_sections %>%
  filter(terrain_type == "climbing", section_distance_mi >= 0.15)

comp_plot1 <- plot_ly() %>%
  add_trace(
    data = all_climbs,
    x = ~section_distance_mi,
    y = ~elevation_gain_ft,
    type = 'scatter',
    mode = 'markers',
    marker = list(color = '#808080', size = 6, opacity = 0.6),
    name = 'Historical Climbs',
    hovertemplate = paste(
      '<b>Historical</b><br>',
      'Distance: %{x:.2f} mi<br>',
      'Elevation: %{y:.0f} ft<br>',
      '<extra></extra>'
    )
  ) %>%
  add_trace(
    data = route_climbs,
    x = ~section_distance_mi,
    y = ~elevation_gain_ft,
    type = 'scatter',
    mode = 'markers',
    marker = list(color = color_climbing, size = 10, opacity = 0.9, symbol = 'diamond'),
    name = 'Predicted Route',
    hovertemplate = paste(
      '<b>This Route</b><br>',
      'Distance: %{x:.2f} mi<br>',
      'Elevation: %{y:.0f} ft<br>',
      '<extra></extra>'
    )
  ) %>%
  layout(
    title = list(text = "Climb Difficulty Comparison", font = list(size = 14)),
    xaxis = list(title = "Distance (miles)"),
    yaxis = list(title = "Elevation Gain (feet)"),
    height = 380,
    showlegend = TRUE
  )

# Plot 2: Predicted ascent rate comparison
route_climbs <- route_climbs %>%
  mutate(
    predicted_rate_of_ascent = if_else(
      predicted_active_time_min > 0,
      elevation_gain_ft / (predicted_active_time_min / 60),
      NA_real_
    )
  )

comp_plot2 <- plot_ly() %>%
  add_trace(
    data = all_climbs,
    x = ~calculated_grade_percent,
    y = ~rate_of_ascent_ft_hr,
    type = 'scatter',
    mode = 'markers',
    marker = list(color = '#808080', size = 6, opacity = 0.6),
    name = 'Historical Climbs',
    hovertemplate = paste(
      '<b>Historical</b><br>',
      'Grade: %{x:.1f}%<br>',
      'Ascent Rate: %{y:.0f} ft/hr<br>',
      '<extra></extra>'
    )
  ) %>%
  add_trace(
    data = route_climbs,
    x = ~calculated_grade_percent,
    y = ~predicted_rate_of_ascent,
    type = 'scatter',
    mode = 'markers',
    marker = list(color = color_climbing, size = 10, opacity = 0.9, symbol = 'diamond'),
    name = 'Predicted Route',
    hovertemplate = paste(
      '<b>This Route</b><br>',
      'Grade: %{x:.1f}%<br>',
      'Predicted Rate: %{y:.0f} ft/hr<br>',
      '<extra></extra>'
    )
  ) %>%
  layout(
    title = list(text = "Predicted Climb Intensity", font = list(size = 14)),
    xaxis = list(title = "Average Grade (%)"),
    yaxis = list(title = "Predicted Ascent Rate (ft/hr)"),
    height = 380,
    showlegend = TRUE
  )

## Prepare table data ----

message("\nPreparing section table data...")

# Enrich route_sections with additional fields for the table
route_sections_table <- route_sections %>%
  mutate(
    # Cumulative times
    start_time_min = cumsum(lag(predicted_active_time_min, default = 0)),
    end_time_min = start_time_min + predicted_active_time_min,

    # Convert to actual times (start time + elapsed)
    start_hour = prediciton_start_time_of_day_h,
    predicted_start_time = sprintf("%02d:%02d",
                                   floor(start_hour + start_time_min / 60),
                                   round((start_time_min %% 60))),
    predicted_end_time = sprintf("%02d:%02d",
                                 floor(start_hour + end_time_min / 60),
                                 round((end_time_min %% 60))),

    # Predicted rate of ascent (for climbing sections)
    predicted_rate_of_ascent = if_else(
      terrain_type == "climbing" & predicted_active_time_min > 0,
      elevation_gain_ft / (predicted_active_time_min / 60),
      NA_real_
    )
  )

# Calculate max distance for relative bar width
max_distance <- max(route_sections_table$section_distance_mi, na.rm = TRUE)

## Build HTML report ----

message("\nBuilding HTML report...")

html_page <- tags$html(
  tags$head(
    tags$title(paste("Route Prediction:", route_display_name)),
    tags$meta(charset = "utf-8"),
    tags$meta(name = "viewport", content = "width=device-width, initial-scale=1"),
    tags$link(
      rel = "stylesheet",
      href = "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css"
    ),
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
        margin-bottom: 10px;
        color: #333;
      }
      .lead {
        color: #666;
        margin-bottom: 25px;
      }
      .stat-card {
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        padding: 15px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .table {
        font-size: 14px;
      }
    "))
  ),
  tags$body(
    tags$div(
      class = "container-fluid",

      # Header
      tags$h1("Route Time Prediction"),
      tags$p(
        class = "lead",
        paste("Predicted completion time for:", route_display_name)
      ),

      # Summary statistics
      tags$div(
        class = "row",
        style = "margin: 20px 0;",

        tags$div(
          class = "col-md-3",
          tags$div(
            class = "stat-card",
            tags$div(style = "font-size: 12px; color: #666; font-weight: 500; margin-bottom: 5px; text-transform: uppercase;", "Total Distance"),
            tags$div(style = "font-size: 24px; font-weight: bold; color: #333;",
                     sprintf("%.2f mi", route_summary$total_distance_mi))
          )
        ),

        tags$div(
          class = "col-md-3",
          tags$div(
            class = "stat-card",
            tags$div(style = "font-size: 12px; color: #666; font-weight: 500; margin-bottom: 5px; text-transform: uppercase;", "Total Elevation Gain"),
            tags$div(style = "font-size: 24px; font-weight: bold; color: #333;",
                     sprintf("%.0f ft", route_summary$total_elevation_gain_ft))
          )
        ),

        tags$div(
          class = "col-md-3",
          tags$div(
            class = "stat-card",
            tags$div(style = "font-size: 12px; color: #666; font-weight: 500; margin-bottom: 5px; text-transform: uppercase;", "Active Time"),
            tags$div(style = "font-size: 24px; font-weight: bold; color: #FF8C00;",
                     sprintf("%.1f hr", route_summary$predicted_active_time_hr)),
            tags$div(style = "font-size: 11px; color: #888; margin-top: 3px;",
                     sprintf("(%.0f min)", route_summary$predicted_active_time_min))
          )
        ),

        tags$div(
          class = "col-md-3",
          tags$div(
            class = "stat-card",
            tags$div(style = "font-size: 12px; color: #666; font-weight: 500; margin-bottom: 5px; text-transform: uppercase;", "Total Time (with rest)"),
            tags$div(style = "font-size: 24px; font-weight: bold; color: #4169E1;",
                     sprintf("%.1f hr", route_summary$predicted_total_time_hr)),
            tags$div(style = "font-size: 11px; color: #888; margin-top: 3px;",
                     sprintf("Rest: %.0f min", route_summary$predicted_rest_time_min))
          )
        )
      ),

      # Map and plots layout (two columns)
      tags$div(
        class = "row",
        style = "margin-top: 10px;",

        # Left: Map
        tags$div(
          class = "col-md-6",
          tags$div(style = "height: 591px; width: 100%;", route_map)
        ),

        # Right: Stacked plots
        tags$div(
          class = "col-md-6",

          # Elevation plot
          tags$div(
            style = "height: 191px; margin-bottom: 10px;",
            elevation_plot
          ),

          # Speed plot
          tags$div(
            style = "height: 191px; margin-bottom: 10px;",
            speed_plot
          ),

          # Elevation gain plot
          tags$div(
            style = "height: 191px;",
            elevation_gain_plot
          )
        )
      ),

      # Section breakdown table (full width below map)
      tags$div(
        style = "margin-top: 30px;",
        tags$h4("Section Breakdown", style = "margin-bottom: 15px;"),
        tags$div(
          class = "table-responsive",
            tags$table(
              class = "table table-bordered table-sm",
              style = "font-size: 13px;",
              tags$thead(
                style = "background-color: #f8f9fa; position: sticky; top: 0;",
                tags$tr(
                  tags$th("Type", style = "text-align: left;"),
                  tags$th("Relative Distance", style = "text-align: left; width: 150px;"),
                  tags$th("Distance (mi)", style = "text-align: right;"),
                  tags$th("Elev Change (ft)", style = "text-align: right;"),
                  tags$th("Grade (%)", style = "text-align: right;"),
                  tags$th("Time (min)", style = "text-align: right;"),
                  tags$th("Ascent Rate (ft/hr)", style = "text-align: right;"),
                  tags$th("Start Time", style = "text-align: right;"),
                  tags$th("End Time", style = "text-align: right;")
                )
              ),
              tags$tbody(
                lapply(seq_len(nrow(route_sections_table)), function(i) {
                  row <- route_sections_table[i, ]

                  # Background color (transparent)
                  bg_color <- switch(row$terrain_type,
                    "climbing" = "rgba(255, 140, 0, 0.1)",
                    "descending" = "rgba(42, 127, 42, 0.1)",
                    "flats" = "rgba(65, 105, 225, 0.1)",
                    "white"
                  )

                  # Bar fill color (solid)
                  bar_color <- switch(row$terrain_type,
                    "climbing" = color_climbing,
                    "descending" = color_descending,
                    "flats" = color_flats,
                    color_flats
                  )

                  # Calculate relative width as percentage
                  bar_width_pct <- (row$section_distance_mi / max_distance) * 100

                  tags$tr(
                    style = paste0("background-color: ", bg_color, ";"),
                    tags$td(tools::toTitleCase(row$terrain_type), style = "text-align: left; font-weight: 500;"),
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
                    tags$td(sprintf("%.2f", row$section_distance_mi), style = "text-align: right;"),
                    tags$td(sprintf("%.0f", row$net_elevation_change_ft), style = "text-align: right;"),
                    tags$td(sprintf("%.1f", row$calculated_grade_percent), style = "text-align: right;"),
                    tags$td(sprintf("%.1f", row$predicted_active_time_min), style = "text-align: right; font-weight: bold;"),
                    tags$td(
                      if (!is.na(row$predicted_rate_of_ascent)) {
                        sprintf("%.0f", row$predicted_rate_of_ascent)
                      } else {
                        "-"
                      },
                      style = "text-align: right;"
                    ),
                    tags$td(row$predicted_start_time, style = "text-align: right;"),
                    tags$td(row$predicted_end_time, style = "text-align: right;")
                  )
                })
              )
            )
        )
      ),

      # Comparative plots
      tags$div(
        style = "margin-top: 40px;",
        tags$h4("Comparison to Historical Climbs", style = "margin-bottom: 20px;"),
        tags$div(
          class = "row",

          tags$div(
            class = "col-md-6",
            tags$div(
              style = "padding: 10px; background: white; border: 1px solid #e0e0e0; border-radius: 6px;",
              comp_plot1
            )
          ),

          tags$div(
            class = "col-md-6",
            tags$div(
              style = "padding: 10px; background: white; border: 1px solid #e0e0e0; border-radius: 6px;",
              comp_plot2
            )
          )
        )
      )
    )
  )
)

## Save HTML ----

output_file <- file.path(validation_dir, paste0("route_prediction_", route_name, ".html"))
message(paste("\nSaving HTML report to:", output_file))

save_html(html_page, file = output_file)

message(paste("✓ Report saved:", output_file))

message("\n=== Stage 7 Complete ===")
message(paste("Route:", route_name))
message(paste("Predicted active time:", sprintf("%.2f hours", route_summary$predicted_active_time_hr)))
message(paste("Report:", output_file))
