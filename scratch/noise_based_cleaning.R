## Noise-Based GPS Data Cleaning
## Uses three-metric approach: location, speed, and elevation noise
## Removes points that are:
##   - >2 SD from rolling mean in 2+ metrics, OR
##   - >5 SD from rolling mean in any single metric

## libraries ----
library(dplyr)
library(purrr)
library(lubridate)
library(ggplot2)
library(tidyr)
library(zoo)
library(leaflet)
library(htmlwidgets)

## functions ----

# Source calculate_segments and haversine_distance functions
source("scratch/clean_gps_data.R", local = TRUE)

# Calculate three-metric noise for a single activity
calculate_activity_noise <- function(points_data, segments_data, activity_id) {
  message(paste("\nProcessing activity:", activity_id))

  # Filter for this activity
  activity_points <- points_data %>%
    filter(activity_id == !!activity_id) %>%
    arrange(time) %>%
    mutate(timestamp = ymd_hms(time))

  activity_segments <- segments_data %>%
    filter(activity_id == !!activity_id) %>%
    arrange(start_time)

  if (nrow(activity_points) < 100) {
    message("  Skipping - too few points (<100)")
    return(NULL)
  }

  # Estimate 30-minute window size
  avg_time_between_points <- mean(diff(as.numeric(activity_points$timestamp)), na.rm = TRUE)
  points_per_30min <- round(1800 / avg_time_between_points)
  message(paste("  30-minute window ≈", points_per_30min, "points"))

  # Ensure minimum window size
  window_size <- max(min(points_per_30min, nrow(activity_points)), 10)

  ## 1. Location Noise (GPS position error)
  # Calculate rolling average position
  activity_points_smoothed <- activity_points %>%
    mutate(
      lon_smooth = rollmean(lon, k = min(50, nrow(.)), fill = NA, align = "center"),
      lat_smooth = rollmean(lat, k = min(50, nrow(.)), fill = NA, align = "center")
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
      rolling_avg_speed_mph = rollmean(speed_mph, k = min(50, nrow(.)),
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
      speed_noise_mph = abs(speed_mph - rolling_avg_speed_mph),
      elapsed_min = as.numeric(timestamp - min(timestamp)) / 60
    )

  ## 3. Elevation Noise
  elevation_data <- activity_points %>%
    mutate(
      timestamp = ymd_hms(time),
      rolling_avg_elevation = rollmean(elevation_ft, k = window_size,
                                       fill = NA, align = "right"),
      elevation_noise_ft = abs(elevation_ft - rolling_avg_elevation)
    ) %>%
    select(timestamp, elevation_ft, rolling_avg_elevation, elevation_noise_ft)

  ## Combine all three noise types
  three_metric_noise <- combined_noise %>%
    select(timestamp, elapsed_min, gps_noise_ft, speed_noise_mph) %>%
    left_join(elevation_data, by = "timestamp") %>%
    filter(!is.na(elevation_noise_ft)) %>%
    mutate(
      # Calculate 30-min rolling statistics for each noise type
      # Location noise
      rolling_mean_location_30 = rollmean(gps_noise_ft, k = window_size,
                                          fill = NA, align = "center"),
      rolling_sd_location_30 = rollapply(gps_noise_ft, width = window_size,
                                         FUN = sd, fill = NA, align = "center"),

      # Speed noise
      rolling_mean_speed_30 = rollmean(speed_noise_mph, k = window_size,
                                       fill = NA, align = "center"),
      rolling_sd_speed_30 = rollapply(speed_noise_mph, width = window_size,
                                      FUN = sd, fill = NA, align = "center"),

      # Elevation noise
      rolling_mean_elevation_30 = rollmean(elevation_noise_ft, k = window_size,
                                           fill = NA, align = "center"),
      rolling_sd_elevation_30 = rollapply(elevation_noise_ft, width = window_size,
                                          FUN = sd, fill = NA, align = "center")
    ) %>%
    # Fill NAs at edges with overall statistics
    mutate(
      rolling_mean_location_30 = if_else(is.na(rolling_mean_location_30),
                                         mean(gps_noise_ft, na.rm = TRUE),
                                         rolling_mean_location_30),
      rolling_sd_location_30 = if_else(is.na(rolling_sd_location_30),
                                       sd(gps_noise_ft, na.rm = TRUE),
                                       rolling_sd_location_30),

      rolling_mean_speed_30 = if_else(is.na(rolling_mean_speed_30),
                                      mean(speed_noise_mph, na.rm = TRUE),
                                      rolling_mean_speed_30),
      rolling_sd_speed_30 = if_else(is.na(rolling_sd_speed_30),
                                    sd(speed_noise_mph, na.rm = TRUE),
                                    rolling_sd_speed_30),

      rolling_mean_elevation_30 = if_else(is.na(rolling_mean_elevation_30),
                                          mean(elevation_noise_ft, na.rm = TRUE),
                                          rolling_mean_elevation_30),
      rolling_sd_elevation_30 = if_else(is.na(rolling_sd_elevation_30),
                                        sd(elevation_noise_ft, na.rm = TRUE),
                                        rolling_sd_elevation_30)
    ) %>%
    mutate(
      # Flag outliers (> 2 SD above rolling mean)
      location_outlier_2sd = gps_noise_ft > (rolling_mean_location_30 + 2 * rolling_sd_location_30),
      speed_outlier_2sd = speed_noise_mph > (rolling_mean_speed_30 + 2 * rolling_sd_speed_30),
      elevation_outlier_2sd = elevation_noise_ft > (rolling_mean_elevation_30 + 2 * rolling_sd_elevation_30),

      # Flag extreme outliers (> 5 SD above rolling mean)
      location_outlier_5sd = gps_noise_ft > (rolling_mean_location_30 + 5 * rolling_sd_location_30),
      speed_outlier_5sd = speed_noise_mph > (rolling_mean_speed_30 + 5 * rolling_sd_speed_30),
      elevation_outlier_5sd = elevation_noise_ft > (rolling_mean_elevation_30 + 5 * rolling_sd_elevation_30),

      # Count how many metrics are outliers at 2 SD
      outlier_count_2sd = location_outlier_2sd + speed_outlier_2sd + elevation_outlier_2sd,

      # Flag if ANY metric is > 5 SD
      extreme_outlier = location_outlier_5sd | speed_outlier_5sd | elevation_outlier_5sd,

      # Flag multi-metric outliers (2 or more at 2 SD)
      multi_metric_outlier = outlier_count_2sd >= 2,

      # Flag for removal: multi-metric OR extreme
      remove_point = multi_metric_outlier | extreme_outlier,

      # Categorize outlier type
      outlier_category = case_when(
        extreme_outlier ~ "Extreme (>5 SD)",
        outlier_count_2sd >= 3 ~ "All three (>2 SD)",
        outlier_count_2sd == 2 ~ "Two metrics (>2 SD)",
        outlier_count_2sd == 1 ~ "One metric (>2 SD)",
        TRUE ~ "Normal"
      )
    )

  # Summary
  n_removed <- sum(three_metric_noise$remove_point, na.rm = TRUE)
  message(paste("  Points flagged for removal:", n_removed,
                paste0("(", round(100 * n_removed / nrow(three_metric_noise), 1), "%)")))

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

# Create geographic validation map
create_geographic_map <- function(raw_points, clean_points, activity_id) {
  raw_act <- raw_points %>% filter(activity_id == !!activity_id) %>% arrange(time)
  clean_act <- clean_points %>% filter(activity_id == !!activity_id) %>% arrange(time)

  map <- leaflet() %>%
    addTiles() %>%
    # Raw track (red, transparent)
    addPolylines(
      data = raw_act,
      lng = ~lon, lat = ~lat,
      color = "red", weight = 2, opacity = 0.4,
      group = "Raw Track"
    ) %>%
    # Cleaned track (blue)
    addPolylines(
      data = clean_act,
      lng = ~lon, lat = ~lat,
      color = "blue", weight = 3, opacity = 0.8,
      group = "Cleaned Track"
    ) %>%
    addLayersControl(
      overlayGroups = c("Raw Track", "Cleaned Track"),
      options = layersControlOptions(collapsed = FALSE)
    ) %>%
    fitBounds(
      lng1 = min(raw_act$lon), lat1 = min(raw_act$lat),
      lng2 = max(raw_act$lon), lat2 = max(raw_act$lat)
    )

  return(map)
}

# Create noise time series plot
create_noise_timeseries_plot <- function(noise_data, activity_id) {
  # Reshape for faceted plotting
  noise_long <- noise_data %>%
    select(elapsed_min, gps_noise_ft, speed_noise_mph, elevation_noise_ft,
           rolling_mean_location_30, rolling_mean_speed_30, rolling_mean_elevation_30,
           outlier_category) %>%
    pivot_longer(
      cols = c(gps_noise_ft, speed_noise_mph, elevation_noise_ft),
      names_to = "metric_type",
      values_to = "noise_value"
    ) %>%
    mutate(
      # Add corresponding rolling means
      rolling_mean = case_when(
        metric_type == "gps_noise_ft" ~ rolling_mean_location_30,
        metric_type == "speed_noise_mph" ~ rolling_mean_speed_30,
        metric_type == "elevation_noise_ft" ~ rolling_mean_elevation_30
      ),
      # Clean metric names
      metric_type = case_when(
        metric_type == "gps_noise_ft" ~ "Location Noise (feet)",
        metric_type == "speed_noise_mph" ~ "Speed Noise (mph)",
        metric_type == "elevation_noise_ft" ~ "Elevation Noise (feet)"
      )
    )

  # Count outliers
  extreme_count <- sum(noise_data$extreme_outlier, na.rm = TRUE)
  multi_count <- sum(noise_data$multi_metric_outlier, na.rm = TRUE)
  all_three_count <- sum(noise_data$outlier_count_2sd == 3, na.rm = TRUE)

  # Create plot
  plot <- ggplot(noise_long, aes(x = elapsed_min, y = noise_value)) +
    # Actual noise
    geom_line(color = "steelblue", alpha = 0.5) +
    geom_point(color = "steelblue", alpha = 0.2, size = 0.3) +

    # Rolling mean (30-min window)
    geom_line(aes(y = rolling_mean), color = "darkgreen", linewidth = 1) +

    # Highlight extreme outliers (5 SD threshold)
    geom_point(
      data = noise_long %>% filter(outlier_category == "Extreme (>5 SD)"),
      aes(y = noise_value), color = "purple", size = 2.5, alpha = 0.8, shape = 18
    ) +

    # Highlight multi-metric outliers (2 SD threshold)
    geom_point(
      data = noise_long %>% filter(outlier_category == "Two metrics (>2 SD)"),
      aes(y = noise_value), color = "orange", size = 2, alpha = 0.7
    ) +
    geom_point(
      data = noise_long %>% filter(outlier_category == "All three (>2 SD)"),
      aes(y = noise_value), color = "red", size = 3, alpha = 0.8, shape = 17
    ) +

    # Facet by metric type
    facet_wrap(~metric_type, ncol = 1, scales = "free_y", strip.position = "left") +

    labs(
      title = paste("Three-Metric GPS Noise Analysis - Activity", activity_id),
      subtitle = paste0("30-minute rolling averages (green line)\n",
                       "Purple diamonds: >5 SD any metric | Orange: >2 SD 2 metrics | Red triangles: >2 SD all 3"),
      x = "Elapsed Time (minutes)",
      y = NULL,
      caption = paste0("Extreme outliers (>5 SD): ", extreme_count,
                      " | Multi-metric (2+ at >2 SD): ", multi_count,
                      " | All three (>2 SD): ", all_three_count)
    ) +
    theme_minimal() +
    theme(
      plot.title = element_text(face = "bold", size = 13),
      plot.subtitle = element_text(color = "gray40", size = 9),
      plot.caption = element_text(hjust = 0, color = "gray50", size = 8),
      strip.placement = "outside",
      strip.text = element_text(face = "bold", size = 10)
    )

  return(plot)
}

## main script ----

message("=== Noise-Based GPS Data Cleaning ===\n")

# Load data
message("Loading GPS data...")
long_points_data <- read.csv("scratch/clean_data/long_points_data.csv")
long_segments_data <- read.csv("scratch/clean_data/long_segments_data.csv")

message(paste("Loaded", nrow(long_points_data), "points and",
              nrow(long_segments_data), "segments"))

# Create output directories
if (!dir.exists("scratch/validation_maps/noise_cleaning")) {
  dir.create("scratch/validation_maps/noise_cleaning", recursive = TRUE)
  message("Created scratch/validation_maps/noise_cleaning/ directory")
}

# Get list of activities
activities <- unique(long_points_data$activity_id)
message(paste("\nProcessing", length(activities), "activities...\n"))

# Initialize temporary files for incremental saving
temp_cleaned_points_file <- "scratch/clean_data/temp_cleaned_points.csv"
temp_noise_data_file <- "scratch/clean_data/temp_noise_data.csv"

# Remove temp files if they exist from previous run
if (file.exists(temp_cleaned_points_file)) file.remove(temp_cleaned_points_file)
if (file.exists(temp_noise_data_file)) file.remove(temp_noise_data_file)

# Track statistics
total_points_removed <- 0
activities_processed <- 0

# Process each activity individually to avoid memory issues
for (i in seq_along(activities)) {
  activity_id <- activities[i]

  message(paste0("[", i, "/", length(activities), "] Processing activity: ", activity_id))

  # Calculate noise
  noise_data <- calculate_activity_noise(long_points_data, long_segments_data, activity_id)

  if (is.null(noise_data)) {
    next
  }

  # Track points removed
  points_removed <- sum(noise_data$remove_point, na.rm = TRUE)
  total_points_removed <- total_points_removed + points_removed

  # Clean points
  cleaned_points <- clean_activity_by_noise(long_points_data, noise_data, activity_id)

  # Save cleaned points incrementally (append mode)
  write.table(cleaned_points, temp_cleaned_points_file,
              sep = ",", row.names = FALSE,
              col.names = !file.exists(temp_cleaned_points_file),
              append = file.exists(temp_cleaned_points_file))

  # Save noise data incrementally (just keep summary stats to save memory)
  noise_summary <- noise_data %>%
    select(timestamp, elapsed_min, outlier_category, remove_point,
           gps_noise_ft, speed_noise_mph, elevation_noise_ft,
           rolling_mean_location_30, rolling_mean_speed_30, rolling_mean_elevation_30) %>%
    mutate(activity_id = activity_id)

  write.table(noise_summary, temp_noise_data_file,
              sep = ",", row.names = FALSE,
              col.names = !file.exists(temp_noise_data_file),
              append = file.exists(temp_noise_data_file))

  # Create geographic map
  geo_map <- create_geographic_map(long_points_data, cleaned_points, activity_id)
  map_file <- paste0("scratch/validation_maps/noise_cleaning/activity_", activity_id, "_geographic.html")
  saveWidget(geo_map, map_file, selfcontained = TRUE)
  message(paste("  Saved geographic map:", map_file))

  # Create noise time series plot
  noise_plot <- create_noise_timeseries_plot(noise_data, activity_id)
  plot_file <- paste0("scratch/validation_maps/noise_cleaning/activity_", activity_id, "_noise_timeseries.png")
  ggsave(plot_file, noise_plot, width = 12, height = 8, dpi = 300)
  message(paste("  Saved noise plot:", plot_file))

  activities_processed <- activities_processed + 1

  # Force garbage collection every 5 activities to free memory
  if (i %% 5 == 0) {
    message("  [Running garbage collection...]")
    gc()
  }
}

# Load cleaned points from temp file
message("\n=== Loading Cleaned Data ===")
clean_points_data <- read.csv(temp_cleaned_points_file)

# Recalculate segments
message("Recalculating segments for cleaned data...")
clean_points_data <- clean_points_data %>% mutate(time = ymd_hms(time))
clean_segments_data <- calculate_segments(clean_points_data)

# Summary statistics
message("\n=== Cleaning Summary ===")
message(paste("Original points:", nrow(long_points_data)))
message(paste("Cleaned points:", nrow(clean_points_data)))
message(paste("Points removed:", total_points_removed,
              paste0("(", round(100 * total_points_removed / nrow(long_points_data), 2), "%)")))

message(paste("\nOriginal segments:", nrow(long_segments_data)))
message(paste("Cleaned segments:", nrow(clean_segments_data)))
message(paste("Activities processed:", activities_processed))

# Save cleaned data
message("\n=== Saving Cleaned Data ===")
write.csv(clean_points_data, "scratch/clean_data/noise_cleaned_points.csv", row.names = FALSE)
message("Saved: scratch/clean_data/noise_cleaned_points.csv")

write.csv(clean_segments_data, "scratch/clean_data/noise_cleaned_segments.csv", row.names = FALSE)
message("Saved: scratch/clean_data/noise_cleaned_segments.csv")

# Rename temp noise file to final name
file.rename(temp_noise_data_file, "scratch/clean_data/noise_analysis_data.csv")
message("Saved: scratch/clean_data/noise_analysis_data.csv")

# Remove temp cleaned points file
file.remove(temp_cleaned_points_file)

message("\n=== Noise-Based Cleaning Complete ===")
message(paste("Validation maps:", activities_processed * 2, "files in scratch/validation_maps/noise_cleaning/"))
message("\nTo view validation maps:")
message('  browseURL("scratch/validation_maps/noise_cleaning/activity_XXXXX_geographic.html")')
message('  Or open PNG files directly')
