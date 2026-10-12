## Clean GPS Data Using Noise-Based Filtering
## Uses three-metric approach: location, speed, and elevation noise
## Removes points that are:
##   - >5 SD from rolling mean in any single metric (extreme outliers), OR
##   - >2 SD from rolling mean in 2+ metrics (multi-metric outliers)

message("\n=== Stage 2: Noise-Based Cleaning ===\n")

## helper functions ----

# Calculate three-metric noise for a single activity
calculate_activity_noise <- function(points_data, segments_data, activity_id) {
  # Filter for this activity
  activity_points <- points_data %>%
    filter(activity_id == !!activity_id) %>%
    arrange(time) %>%
    mutate(timestamp = ymd_hms(time))

  activity_segments <- segments_data %>%
    filter(activity_id == !!activity_id) %>%
    arrange(start_time)

  if (nrow(activity_points) < min_points_for_analysis) {
    return(NULL)
  }

  # Estimate 30-minute window size
  avg_time_between_points <- mean(diff(as.numeric(activity_points$timestamp)), na.rm = TRUE)
  points_per_30min <- round(time_filter_range_sec / avg_time_between_points)

  # Ensure minimum window size
  window_size <- max(min(points_per_30min, nrow(activity_points)), 10)

  ## 1. Location Noise (GPS position error)
  # Calculate rolling average position
  activity_points_smoothed <- activity_points %>%
    mutate(
      lon_smooth = rollmean(lon, k = min(point_filter_range, nrow(.)),
                           fill = NA, align = "center"),
      lat_smooth = rollmean(lat, k = min(point_filter_range, nrow(.)),
                           fill = NA, align = "center")
    )

  # Calculate deviation from smoothed position
  noise_analysis <- activity_points_smoothed %>%
    mutate(
      gps_noise_m = haversine_distance(lon, lat, lon_smooth, lat_smooth),
      gps_noise_ft = gps_noise_m * 3.28084
    )

  ## 2. Speed Noise
  # Calculate rolling average speed
  activity_segments_with_rolling <- activity_segments %>%
    mutate(
      timestamp = ymd_hms(start_time),
      rolling_avg_speed_mph = rollmean(speed_mph, k = min(point_filter_range, nrow(.)),
                                       fill = NA, align = "center")
    )

  # Join with noise analysis
  combined_noise <- noise_analysis %>%
    left_join(
      activity_segments_with_rolling %>%
        select(timestamp, speed_mph, rolling_avg_speed_mph),
      by = "timestamp"
    ) %>%
    mutate(
      speed_noise_mph = abs(speed_mph - rolling_avg_speed_mph)
    )

  ## 3. Elevation Noise
  elevation_data <- activity_points %>%
    mutate(
      timestamp = ymd_hms(time),
      rolling_avg_elevation = rollmean(elevation_ft, k = window_size,
                                       fill = NA, align = "right"),
      elevation_noise_ft = abs(elevation_ft - rolling_avg_elevation)
    ) %>%
    select(timestamp, rolling_avg_elevation, elevation_noise_ft)

  ## Combine all three noise types
  three_metric_noise <- combined_noise %>%
    select(timestamp, gps_noise_ft, speed_noise_mph) %>%
    left_join(elevation_data, by = "timestamp") %>%
    filter(!is.na(elevation_noise_ft)) %>%
    mutate(
      # Calculate 30-min rolling statistics for each noise type
      # Location noise
      rolling_mean_location = rollmean(gps_noise_ft, k = window_size,
                                      fill = NA, align = "center"),
      rolling_sd_location = rollapply(gps_noise_ft, width = window_size,
                                     FUN = sd, fill = NA, align = "center"),

      # Speed noise
      rolling_mean_speed = rollmean(speed_noise_mph, k = window_size,
                                   fill = NA, align = "center"),
      rolling_sd_speed = rollapply(speed_noise_mph, width = window_size,
                                  FUN = sd, fill = NA, align = "center"),

      # Elevation noise
      rolling_mean_elevation = rollmean(elevation_noise_ft, k = window_size,
                                       fill = NA, align = "center"),
      rolling_sd_elevation = rollapply(elevation_noise_ft, width = window_size,
                                      FUN = sd, fill = NA, align = "center")
    ) %>%
    # Fill NAs at edges with overall statistics
    mutate(
      rolling_mean_location = if_else(is.na(rolling_mean_location),
                                     mean(gps_noise_ft, na.rm = TRUE),
                                     rolling_mean_location),
      rolling_sd_location = if_else(is.na(rolling_sd_location),
                                   sd(gps_noise_ft, na.rm = TRUE),
                                   rolling_sd_location),

      rolling_mean_speed = if_else(is.na(rolling_mean_speed),
                                  mean(speed_noise_mph, na.rm = TRUE),
                                  rolling_mean_speed),
      rolling_sd_speed = if_else(is.na(rolling_sd_speed),
                                sd(speed_noise_mph, na.rm = TRUE),
                                rolling_sd_speed),

      rolling_mean_elevation = if_else(is.na(rolling_mean_elevation),
                                      mean(elevation_noise_ft, na.rm = TRUE),
                                      rolling_mean_elevation),
      rolling_sd_elevation = if_else(is.na(rolling_sd_elevation),
                                    sd(elevation_noise_ft, na.rm = TRUE),
                                    rolling_sd_elevation)
    ) %>%
    mutate(
      # Flag outliers (> 2 SD above rolling mean)
      location_outlier_2sd = gps_noise_ft > (rolling_mean_location + two_noise_metric_filter_threshold * rolling_sd_location),
      speed_outlier_2sd = speed_noise_mph > (rolling_mean_speed + two_noise_metric_filter_threshold * rolling_sd_speed),
      elevation_outlier_2sd = elevation_noise_ft > (rolling_mean_elevation + two_noise_metric_filter_threshold * rolling_sd_elevation),

      # Flag extreme outliers (> 5 SD above rolling mean)
      location_outlier_5sd = gps_noise_ft > (rolling_mean_location + one_noise_metric_filter_threshold * rolling_sd_location),
      speed_outlier_5sd = speed_noise_mph > (rolling_mean_speed + one_noise_metric_filter_threshold * rolling_sd_speed),
      elevation_outlier_5sd = elevation_noise_ft > (rolling_mean_elevation + one_noise_metric_filter_threshold * rolling_sd_elevation),

      # Count how many metrics are outliers at 2 SD
      outlier_count_2sd = location_outlier_2sd + speed_outlier_2sd + elevation_outlier_2sd,

      # Flag if ANY metric is > 5 SD
      extreme_outlier = location_outlier_5sd | speed_outlier_5sd | elevation_outlier_5sd,

      # Flag multi-metric outliers (2 or more at 2 SD)
      multi_metric_outlier = outlier_count_2sd >= 2,

      # Flag for removal: multi-metric OR extreme
      remove_point = multi_metric_outlier | extreme_outlier
    )

  return(three_metric_noise)
}

# Clean activity based on noise flags
clean_activity_by_noise <- function(points_data, noise_flags, activity_id) {
  # Get timestamps to remove
  timestamps_to_remove <- noise_flags %>%
    filter(remove_point) %>%
    pull(timestamp)

  # Filter points
  cleaned_points <- points_data %>%
    filter(activity_id == !!activity_id) %>%
    mutate(timestamp = ymd_hms(time)) %>%
    filter(!timestamp %in% timestamps_to_remove) %>%
    select(-timestamp)

  return(cleaned_points)
}

## main processing ----

# Load initial data from stage 1
message("Loading data from stage 1...")
input_points_data <- read.csv(file.path(clean_data_dir, "long_points_data.csv"))
input_segments_data <- read.csv(file.path(clean_data_dir, "long_segments_data.csv"))
activity_metadata <- read.csv(file.path(clean_data_dir, "activity_metadata.csv"))

initial_point_count <- nrow(input_points_data)
message(paste("  Loaded", format(initial_point_count, big.mark = ","), "points"))
message(paste("  Loaded", format(nrow(input_segments_data), big.mark = ","), "segments"))

# Extract timezone information for adding to segments later
activity_timezones <- activity_metadata %>%
  select(activity_id, timezone)

# Track statistics across all iterations
iteration_stats <- list()

# Run iterative denoising
message(paste("\n=== Running", denoising_iterations, "Denoising Iterations ===\n"))

for (iter in 1:denoising_iterations) {
  message(paste0("\n--- Iteration ", iter, " of ", denoising_iterations, " ---"))

  # Get list of activities
  activities <- unique(input_points_data$activity_id)
  message(paste("Processing", length(activities), "activities..."))

  # Initialize temporary file for incremental saving
  temp_cleaned_points_file <- file.path(clean_data_dir, paste0("temp_denoised_iter", iter, ".csv"))

  # Remove temp file if it exists from previous run
  if (file.exists(temp_cleaned_points_file)) file.remove(temp_cleaned_points_file)

  # Track statistics for this iteration
  total_points_removed <- 0
  activities_processed <- 0
  activities_skipped <- 0

  # Process each activity individually to avoid memory issues
  for (i in seq_along(activities)) {
    activity_id <- activities[i]

    # Calculate noise
    noise_data <- calculate_activity_noise(input_points_data, input_segments_data, activity_id)

    if (is.null(noise_data)) {
      activities_skipped <- activities_skipped + 1
      next
    }

    # Track points removed
    points_removed <- sum(noise_data$remove_point, na.rm = TRUE)
    total_points_removed <- total_points_removed + points_removed

    if (points_removed > 0) {
      message(paste0("  [", i, "/", length(activities), "] Activity ", activity_id,
                     ": removing ", points_removed, " points (",
                     round(100 * points_removed / nrow(noise_data), 1), "%)"))
    }

    # Clean points
    cleaned_points <- clean_activity_by_noise(input_points_data, noise_data, activity_id)

    # Save cleaned points incrementally (append mode)
    write.table(cleaned_points, temp_cleaned_points_file,
                sep = ",", row.names = FALSE,
                col.names = !file.exists(temp_cleaned_points_file),
                append = file.exists(temp_cleaned_points_file))

    activities_processed <- activities_processed + 1

    # Force garbage collection every 5 activities to free memory
    if (i %% 5 == 0) {
      gc(verbose = FALSE)
    }
  }

  # Load cleaned points from temp file
  message(paste("\nLoading cleaned data from iteration", iter, "..."))
  denoised_points_data <- read.csv(temp_cleaned_points_file)

  # Recalculate segments
  message("Recalculating segments...")
  denoised_points_data <- denoised_points_data %>% mutate(time = ymd_hms(time))
  denoised_segments_data <- calculate_segments(denoised_points_data)

  # Add timezone and local time to segments
  denoised_segments_data <- denoised_segments_data %>%
    left_join(activity_timezones, by = "activity_id") %>%
    group_by(activity_id) %>%
    group_split() %>%
    map_df(function(activity_df) {
      tz <- first(activity_df$timezone)

      if (is.na(tz)) {
        activity_df %>%
          mutate(
            start_time_local = NA_character_,
            end_time_local = NA_character_,
            start_hour_local = NA_integer_
          )
      } else {
        activity_df %>%
          mutate(
            start_time_local_dt = with_tz(ymd_hms(start_time, tz = "UTC"), tz),
            end_time_local_dt = with_tz(ymd_hms(end_time, tz = "UTC"), tz),
            start_time_local = format(start_time_local_dt, "%Y-%m-%d %H:%M:%S"),
            end_time_local = format(end_time_local_dt, "%Y-%m-%d %H:%M:%S"),
            start_hour_local = hour(start_time_local_dt)
          ) %>%
          select(-start_time_local_dt, -end_time_local_dt)
      }
    }) %>%
    select(
      activity_id,
      activity_start_time,
      activity_end_time,
      start_time,
      start_time_local,
      start_hour_local,
      end_time,
      end_time_local,
      timezone,
      everything()
    )

  # Filter out points where preceding segment exceeds max speed
  message(paste("\nFiltering points with segment speed >", max_speed_mph, "mph..."))
  points_before_speed_filter <- nrow(denoised_points_data)

  # Get segments that exceed max speed threshold
  excessive_speed_segments <- denoised_segments_data %>%
    filter(speed_mph > max_speed_mph) %>%
    select(activity_id, start_time, end_time)

  if (nrow(excessive_speed_segments) > 0) {
    # Remove points that fall within excessive speed segments
    denoised_points_data <- denoised_points_data %>%
      anti_join(
        excessive_speed_segments %>%
          rename(point_time = start_time) %>%
          select(activity_id, point_time),
        by = c("activity_id", "time" = "point_time")
      ) %>%
      anti_join(
        excessive_speed_segments %>%
          rename(point_time = end_time) %>%
          select(activity_id, point_time),
        by = c("activity_id", "time" = "point_time")
      )

    points_removed_speed <- points_before_speed_filter - nrow(denoised_points_data)
    message(paste("  Removed", points_removed_speed, "points (",
                  round(100 * points_removed_speed / points_before_speed_filter, 2), "%)"))

    # Recalculate segments after speed filtering
    if (points_removed_speed > 0) {
      message("  Recalculating segments after speed filter...")
      denoised_segments_data <- calculate_segments(denoised_points_data)

      # Re-add timezone and local time to segments
      denoised_segments_data <- denoised_segments_data %>%
        left_join(activity_timezones, by = "activity_id") %>%
        group_by(activity_id) %>%
        group_split() %>%
        map_df(function(activity_df) {
          tz <- first(activity_df$timezone)

          if (is.na(tz)) {
            activity_df %>%
              mutate(
                start_time_local = NA_character_,
                end_time_local = NA_character_,
                start_hour_local = NA_integer_
              )
          } else {
            activity_df %>%
              mutate(
                start_time_local_dt = with_tz(ymd_hms(start_time, tz = "UTC"), tz),
                end_time_local_dt = with_tz(ymd_hms(end_time, tz = "UTC"), tz),
                start_time_local = format(start_time_local_dt, "%Y-%m-%d %H:%M:%S"),
                end_time_local = format(end_time_local_dt, "%Y-%m-%d %H:%M:%S"),
                start_hour_local = hour(start_time_local_dt)
              ) %>%
              select(-start_time_local_dt, -end_time_local_dt)
          }
        }) %>%
        select(
          activity_id,
          activity_start_time,
          activity_end_time,
          start_time,
          start_time_local,
          start_hour_local,
          end_time,
          end_time_local,
          timezone,
          everything()
        )
    }

    # Update total points removed to include speed filtering
    total_points_removed <- total_points_removed + points_removed_speed
  } else {
    message("  No points exceeded speed threshold")
  }

  # Store iteration statistics
  iteration_stats[[iter]] <- list(
    iteration = iter,
    input_points = nrow(input_points_data),
    output_points = nrow(denoised_points_data),
    points_removed = total_points_removed,
    pct_removed = round(100 * total_points_removed / nrow(input_points_data), 2),
    activities_processed = activities_processed,
    activities_skipped = activities_skipped
  )

  # Summary for this iteration
  message(paste("\n=== Iteration", iter, "Summary ==="))
  message(paste("Activities processed:", activities_processed))
  message(paste("Activities skipped:", activities_skipped, "(< min points)"))
  message(paste("Input points:", format(nrow(input_points_data), big.mark = ",")))
  message(paste("Output points:", format(nrow(denoised_points_data), big.mark = ",")))
  message(paste("Points removed:", format(total_points_removed, big.mark = ","),
                paste0("(", round(100 * total_points_removed / nrow(input_points_data), 2), "%)")))

  # Remove temp file
  file.remove(temp_cleaned_points_file)

  # Update input data for next iteration
  if (iter < denoising_iterations) {
    input_points_data <- denoised_points_data
    input_segments_data <- denoised_segments_data
  }
}

# Overall summary statistics
message("\n=== Overall Cleaning Summary ===")
message(paste("Total iterations:", denoising_iterations))
message(paste("\nOriginal points:", format(initial_point_count, big.mark = ",")))
message(paste("Final points:", format(nrow(denoised_points_data), big.mark = ",")))
total_removed <- initial_point_count - nrow(denoised_points_data)
message(paste("Total points removed:", format(total_removed, big.mark = ","),
              paste0("(", round(100 * total_removed / initial_point_count, 2), "%)")))

# Print iteration breakdown
message("\nIteration breakdown:")
for (stat in iteration_stats) {
  message(paste0("  Iteration ", stat$iteration, ": ",
                 format(stat$points_removed, big.mark = ","), " points removed (",
                 stat$pct_removed, "%)"))
}

# Classify segments as rest or active using rolling averages
message("\n=== Classifying Rest vs. Active Segments ===")
message(paste("Rolling window:", rest_rolling_window_min, "minutes"))
message(paste("Speed threshold:", rest_speed_threshold_mph, "mph (rolling avg)"))
message(paste("Elevation change threshold:", rest_elevation_change_threshold_ft_per_min, "ft/min (absolute)"))

# Calculate rolling averages and classify by activity
denoised_segments_data <- denoised_segments_data %>%
  group_by(activity_id) %>%
  arrange(start_time) %>%
  mutate(
    # Calculate time window size in seconds
    rolling_window_sec = rest_rolling_window_min * 60,

    # Calculate cumulative time for rolling window
    cumulative_time_sec = cumsum(time_delta_sec),

    # Estimate number of segments in rolling window
    # (will vary based on segment length)
    avg_segment_time = mean(time_delta_sec, na.rm = TRUE),
    window_segments = max(round(rolling_window_sec / avg_segment_time), 3),

    # Calculate 5-minute rolling average speed
    rolling_avg_speed_mph = rollmean(
      speed_mph,
      k = min(window_segments, n()),
      fill = NA,
      align = "center"
    ),

    # Fill NAs at edges with segment speed
    rolling_avg_speed_mph = if_else(
      is.na(rolling_avg_speed_mph),
      speed_mph,
      rolling_avg_speed_mph
    ),

    # Calculate absolute elevation change per minute for this segment
    elevation_change_ft = abs(elevation_delta_ft),  # Absolute value (up or down)
    elevation_change_ft_per_min = if_else(
      time_delta_sec > 0,
      elevation_change_ft / (time_delta_sec / 60),
      0
    ),

    # Classify as rest if BOTH conditions met:
    # 1. Rolling avg speed < threshold AND
    # 2. Absolute elevation change rate < threshold
    is_rest = (rolling_avg_speed_mph < rest_speed_threshold_mph) &
              (elevation_change_ft_per_min < rest_elevation_change_threshold_ft_per_min),

    segment_type = if_else(is_rest, "rest", "active")
  ) %>%
  ungroup() %>%
  select(-rolling_window_sec, -cumulative_time_sec, -avg_segment_time,
         -window_segments, -elevation_change_ft)

# Rest classification summary
n_rest <- sum(denoised_segments_data$is_rest, na.rm = TRUE)
n_active <- sum(!denoised_segments_data$is_rest, na.rm = TRUE)
pct_rest <- round(100 * n_rest / nrow(denoised_segments_data), 1)

message(paste("Total segments:", format(nrow(denoised_segments_data), big.mark = ",")))
message(paste("Rest segments:", format(n_rest, big.mark = ","), paste0("(", pct_rest, "%)")))
message(paste("Active segments:", format(n_active, big.mark = ","), paste0("(", 100 - pct_rest, "%)")))

# Calculate time statistics
total_time_sec <- sum(denoised_segments_data$time_delta_sec, na.rm = TRUE)
rest_time_sec <- sum(denoised_segments_data$time_delta_sec[denoised_segments_data$is_rest], na.rm = TRUE)
active_time_sec <- total_time_sec - rest_time_sec
pct_time_rest <- round(100 * rest_time_sec / total_time_sec, 1)

message(paste("\nTotal time:", round(total_time_sec / 3600, 2), "hours"))
message(paste("Rest time:", round(rest_time_sec / 3600, 2), "hours", paste0("(", pct_time_rest, "%)")))
message(paste("Active time:", round(active_time_sec / 3600, 2), "hours", paste0("(", 100 - pct_time_rest, "%)")))

# Save final cleaned data
message("\n=== Saving Final Cleaned Data ===")
write.csv(denoised_points_data,
          file.path(clean_data_dir, "denoised_points_data.csv"),
          row.names = FALSE)
message(paste("  Saved:", file.path(clean_data_dir, "denoised_points_data.csv")))

write.csv(denoised_segments_data,
          file.path(clean_data_dir, "denoised_segments_data.csv"),
          row.names = FALSE)
message(paste("  Saved:", file.path(clean_data_dir, "denoised_segments_data.csv")))

message("\n=== Stage 2 Complete ===")
