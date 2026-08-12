## Create Distance-Based Intervals
## Aggregates GPS segments into fixed-distance buckets (0.05 mile)
## These intervals will be used for time prediction modeling

message("\n=== Stage 4: Creating Distance-Based Intervals ===\n")

## helper functions ----

# Create distance-based intervals from segments data
create_distance_intervals <- function(segments_data, interval_distance_mi) {
  segments_data %>%
    group_by(activity_id) %>%
    arrange(start_time) %>%
    mutate(
      # Calculate cumulative distance
      cumulative_distance_mi = cumsum(distance_3d_mi),
      # Assign to interval (floor to create buckets)
      distance_interval = floor(cumulative_distance_mi / interval_distance_mi)
    ) %>%
    # Aggregate by interval
    group_by(activity_id, distance_interval) %>%
    summarise(
      # Time metrics - total elapsed time (including rest)
      total_elapsed_time_sec = sum(time_delta_sec, na.rm = TRUE),
      total_elapsed_time_min = total_elapsed_time_sec / 60,

      # Active time (excluding rest)
      active_time_sec = sum(time_delta_sec[!is_rest], na.rm = TRUE),
      active_time_min = active_time_sec / 60,

      # Rest time
      rest_time_sec = sum(time_delta_sec[is_rest], na.rm = TRUE),
      rest_time_min = rest_time_sec / 60,

      # Rest percentage
      pct_time_resting = if_else(
        total_elapsed_time_sec > 0,
        100 * rest_time_sec / total_elapsed_time_sec,
        0
      ),

      # Segment counts
      n_rest_segments = sum(is_rest, na.rm = TRUE),
      n_active_segments = sum(!is_rest, na.rm = TRUE),

      interval_start_time = first(start_time),
      interval_start_time_local = first(start_time_local),
      interval_start_hour_local = first(start_hour_local),

      # Distance metrics (should be ~interval_distance_mi per interval)
      interval_distance_mi = sum(distance_3d_mi, na.rm = TRUE),
      cumulative_distance_mi = first(cumulative_distance_mi),

      # Elevation metrics
      elevation_gain_ft = sum(elevation_delta_ft[elevation_delta_ft > 0], na.rm = TRUE),
      elevation_loss_ft = abs(sum(elevation_delta_ft[elevation_delta_ft < 0], na.rm = TRUE)),
      net_elevation_change_ft = sum(elevation_delta_ft, na.rm = TRUE),
      start_elevation_ft = first(start_elevation_ft),
      end_elevation_ft = last(end_elevation_ft),

      # Speed/pace metrics (time-weighted averages)
      avg_speed_mph = weighted.mean(speed_mph, w = time_delta_sec, na.rm = TRUE),
      avg_grade_percent = weighted.mean(grade_percent, w = time_delta_sec, na.rm = TRUE),
      avg_pace_min_mi = weighted.mean(pace_min_mi, w = time_delta_sec, na.rm = TRUE),

      # Gradient metrics (useful for modeling)
      max_grade_percent = max(grade_percent, na.rm = TRUE),
      min_grade_percent = min(grade_percent, na.rm = TRUE),

      # Segment count
      n_segments = n(),

      .groups = "drop"
    ) %>%
    # Add derived metrics
    mutate(
      # Calculate average grade from elevation change and distance
      # This is more accurate than the weighted average of segment grades
      calculated_grade_percent = if_else(
        interval_distance_mi > 0,
        (net_elevation_change_ft / (interval_distance_mi * 5280)) * 100,
        0
      ),

      # Pace calculations (min/mile)
      # Elapsed pace includes rest time
      elapsed_pace_min_mi = if_else(
        interval_distance_mi > 0,
        total_elapsed_time_min / interval_distance_mi,
        NA_real_
      ),

      # Active pace excludes rest time (moving pace)
      active_pace_min_mi = if_else(
        interval_distance_mi > 0,
        active_time_min / interval_distance_mi,
        NA_real_
      )
    )
}

## main processing ----

# Load denoised segments data from stage 2
message("Loading denoised segments data from stage 2...")
denoised_segments_data <- read.csv(file.path(clean_data_dir, "denoised_segments_data.csv"))

message(paste("  Loaded", format(nrow(denoised_segments_data), big.mark = ","), "segments"))

# Get unique activities
n_activities <- length(unique(denoised_segments_data$activity_id))
message(paste("  Activities:", n_activities))

# Create distance-based intervals
message(paste("\nCreating distance intervals with", distance_interval_mi, "mile buckets..."))

distance_intervals <- create_distance_intervals(denoised_segments_data, distance_interval_mi)

# Summary statistics
message("\n=== Interval Summary ===")
message(paste("Total intervals created:", format(nrow(distance_intervals), big.mark = ",")))
message(paste("Intervals per activity (avg):", round(nrow(distance_intervals) / n_activities, 1)))

# Check interval distances
avg_interval_dist <- mean(distance_intervals$interval_distance_mi, na.rm = TRUE)
message(paste("\nAverage interval distance:", round(avg_interval_dist, 4), "miles"))
message(paste("Target interval distance:", distance_interval_mi, "miles"))
message(paste("Deviation:", round((avg_interval_dist - distance_interval_mi) * 5280, 1), "feet"))

# Classify terrain type using rolling average elevation change
message("\n=== Classifying Terrain Type ===")
message(paste("Rolling window:", terrain_rolling_intervals, "intervals (",
              terrain_rolling_intervals * distance_interval_mi, "miles)"))
message(paste("Climb threshold: >", terrain_climb_threshold_ft, "feet"))
message(paste("Descent threshold: <", terrain_descent_threshold_ft, "feet"))

distance_intervals <- distance_intervals %>%
  group_by(activity_id) %>%
  arrange(distance_interval) %>%
  mutate(
    # Calculate rolling average net elevation change
    rolling_avg_elevation_change = rollmean(
      net_elevation_change_ft,
      k = min(terrain_rolling_intervals, n()),
      fill = NA,
      align = "center"
    ),

    # Fill NAs at edges with actual elevation change
    rolling_avg_elevation_change = if_else(
      is.na(rolling_avg_elevation_change),
      net_elevation_change_ft,
      rolling_avg_elevation_change
    ),

    # Classify terrain type
    terrain_type = case_when(
      rolling_avg_elevation_change > terrain_climb_threshold_ft ~ "climbing",
      rolling_avg_elevation_change < terrain_descent_threshold_ft ~ "descending",
      TRUE ~ "flats"
    )
  ) %>%
  ungroup()

# Terrain classification summary
terrain_counts <- distance_intervals %>%
  count(terrain_type) %>%
  mutate(pct = round(100 * n / sum(n), 1))

message("\nTerrain distribution:")
for (i in seq_len(nrow(terrain_counts))) {
  message(paste0("  ", terrain_counts$terrain_type[i], ": ",
                 format(terrain_counts$n[i], big.mark = ","), " intervals (",
                 terrain_counts$pct[i], "%)"))
}

# Save distance intervals
message("\n=== Saving Distance Intervals ===")
output_file <- file.path(clean_data_dir, "distance_intervals.csv")
write.csv(distance_intervals, output_file, row.names = FALSE)
message(paste("  Saved:", output_file))

# Aggregate consecutive intervals of same terrain type into sections
message("\n=== Creating Terrain Sections ===")

terrain_sections <- distance_intervals %>%
  group_by(activity_id) %>%
  arrange(distance_interval) %>%
  mutate(
    # Detect change in terrain type
    terrain_change = terrain_type != lag(terrain_type, default = ""),
    # Create section ID (increment when terrain changes)
    section_id = cumsum(terrain_change)
  ) %>%
  group_by(activity_id, section_id) %>%
  summarise(
    # Section identification
    terrain_type = first(terrain_type),
    section_start_interval = first(distance_interval),
    section_end_interval = last(distance_interval),
    n_intervals = n(),

    # Time metrics
    total_elapsed_time_sec = sum(total_elapsed_time_sec, na.rm = TRUE),
    total_elapsed_time_min = total_elapsed_time_sec / 60,
    active_time_sec = sum(active_time_sec, na.rm = TRUE),
    active_time_min = active_time_sec / 60,
    rest_time_sec = sum(rest_time_sec, na.rm = TRUE),
    rest_time_min = rest_time_sec / 60,
    pct_time_resting = if_else(
      total_elapsed_time_sec > 0,
      100 * rest_time_sec / total_elapsed_time_sec,
      0
    ),

    # Distance
    section_distance_mi = sum(interval_distance_mi, na.rm = TRUE),

    # Elevation
    elevation_gain_ft = sum(elevation_gain_ft, na.rm = TRUE),
    elevation_loss_ft = sum(elevation_loss_ft, na.rm = TRUE),
    net_elevation_change_ft = sum(net_elevation_change_ft, na.rm = TRUE),
    start_elevation_ft = first(start_elevation_ft),
    end_elevation_ft = last(end_elevation_ft),

    # Speed/pace (weighted averages, manually calculated to handle NAs)
    avg_speed_mph = sum(avg_speed_mph * active_time_sec, na.rm = TRUE) /
                    sum(active_time_sec[!is.na(avg_speed_mph)], na.rm = TRUE),
    avg_active_pace_min_mi = sum(active_pace_min_mi * interval_distance_mi, na.rm = TRUE) /
                             sum(interval_distance_mi[!is.na(active_pace_min_mi)], na.rm = TRUE),

    # Grade
    calculated_grade_percent = if_else(
      section_distance_mi > 0,
      (net_elevation_change_ft / (section_distance_mi * 5280)) * 100,
      0
    ),

    # Start time
    section_start_time = first(interval_start_time),
    section_start_time_local = first(interval_start_time_local),

    .groups = "drop"
  )

# Section summary
message(paste("Total sections created:", format(nrow(terrain_sections), big.mark = ",")))
message(paste("Sections per activity (avg):", round(nrow(terrain_sections) / n_activities, 1)))

section_type_counts <- terrain_sections %>%
  count(terrain_type) %>%
  mutate(pct = round(100 * n / sum(n), 1))

message("\nSection distribution:")
for (i in seq_len(nrow(section_type_counts))) {
  message(paste0("  ", section_type_counts$terrain_type[i], ": ",
                 format(section_type_counts$n[i], big.mark = ","), " sections (",
                 section_type_counts$pct[i], "%)"))
}

# Save terrain sections
message("\n=== Saving Distance Intervals ===")
output_file <- file.path(clean_data_dir, "distance_intervals.csv")
write.csv(distance_intervals, output_file, row.names = FALSE)
message(paste("  Saved:", output_file))

message("\n=== Saving Terrain Sections ===")
sections_file <- file.path(clean_data_dir, "terrain_sections.csv")
write.csv(terrain_sections, sections_file, row.names = FALSE)
message(paste("  Saved:", sections_file))

# Display summary of key metrics
message("\n=== Interval Metrics Summary ===")
message(paste("Elapsed time per interval (avg):", round(mean(distance_intervals$total_elapsed_time_min, na.rm = TRUE), 2), "minutes"))
message(paste("Active time per interval (avg):", round(mean(distance_intervals$active_time_min, na.rm = TRUE), 2), "minutes"))
message(paste("Rest time per interval (avg):", round(mean(distance_intervals$rest_time_min, na.rm = TRUE), 2), "minutes"))
message(paste("% time resting (avg):", round(mean(distance_intervals$pct_time_resting, na.rm = TRUE), 1), "%"))
message(paste("\nElevation gain per interval (avg):", round(mean(distance_intervals$elevation_gain_ft, na.rm = TRUE), 1), "feet"))
message(paste("Average grade (avg):", round(mean(distance_intervals$calculated_grade_percent, na.rm = TRUE), 2), "%"))
message(paste("Average speed (avg):", round(mean(distance_intervals$avg_speed_mph, na.rm = TRUE), 2), "mph"))
message(paste("Active pace (avg):", round(mean(distance_intervals$active_pace_min_mi, na.rm = TRUE), 2), "min/mile"))

message("\n=== Section Metrics Summary ===")
message(paste("Distance per section (avg):", round(mean(terrain_sections$section_distance_mi, na.rm = TRUE), 2), "miles"))
message(paste("Elapsed time per section (avg):", round(mean(terrain_sections$total_elapsed_time_min, na.rm = TRUE), 1), "minutes"))
message(paste("Active time per section (avg):", round(mean(terrain_sections$active_time_min, na.rm = TRUE), 1), "minutes"))
message(paste("Rest time per section (avg):", round(mean(terrain_sections$rest_time_min, na.rm = TRUE), 1), "minutes"))

message("\n=== Stage 4 Complete ===")
message(paste("Distance intervals:", output_file))
message(paste("Terrain sections:", sections_file))


