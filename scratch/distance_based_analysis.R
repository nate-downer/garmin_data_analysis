## distance based analysis

## libraries ----
library(dplyr)
library(purrr)
library(lubridate)
library(leaflet)
library(htmlwidgets)

## functions ----

# Clean GPS outliers by removing points with excessive speeds
clean_gps_outliers <- function(points_data, segments_data, speed_threshold_mph = 10) {
  # Source the calculate_segments function
  source("scratch/clean_gps_data.R", local = TRUE)

  # Get unique activities
  activities <- unique(segments_data$activity_id)

  cleaned_points_list <- list()

  for (act_id in activities) {
    message(paste("Cleaning activity:", act_id))

    # Get activity data
    act_segments <- segments_data %>% filter(activity_id == act_id)
    act_points <- points_data %>% filter(activity_id == act_id) %>% arrange(time)

    # Find outlier segment indices (where speed exceeds threshold)
    outlier_indices <- which(act_segments$speed_mph > speed_threshold_mph)

    if (length(outlier_indices) > 0) {
      # Each outlier segment corresponds to points i and i+1
      # We need to remove the points that create these segments
      points_to_remove <- unique(c(outlier_indices, outlier_indices + 1))

      # Ensure we don't remove out of bounds
      points_to_remove <- points_to_remove[points_to_remove <= nrow(act_points)]

      message(paste("  Removing", length(points_to_remove), "outlier points"))

      # Remove outliers
      clean_points <- act_points[-points_to_remove, ]
    } else {
      message("  No outliers found")
      clean_points <- act_points
    }

    cleaned_points_list[[as.character(act_id)]] <- clean_points
  }

  # Combine all activities
  clean_points_data <- bind_rows(cleaned_points_list)

  message("\nRecalculating segments for cleaned data...")

  # Parse time column to datetime (needed when data comes from CSV)
  clean_points_data <- clean_points_data %>%
    mutate(time = ymd_hms(time))

  # Recalculate segments using existing calculate_segments() function
  clean_segments_data <- calculate_segments(clean_points_data)

  message(paste("Cleaning complete. Removed",
                nrow(points_data) - nrow(clean_points_data),
                "points total"))

  return(list(
    points = clean_points_data,
    segments = clean_segments_data
  ))
}

# Visualize GPS cleaning using leaflet maps
visualize_gps_cleaning <- function(raw_points, clean_points, activity_id, segments_data = NULL) {
  # Filter for specific activity
  raw_act <- raw_points %>% filter(activity_id == !!activity_id) %>% arrange(time)
  clean_act <- clean_points %>% filter(activity_id == !!activity_id) %>% arrange(time)

  # Create map
  map <- leaflet() %>%
    addTiles() %>%
    # Raw track (red)
    addPolylines(
      data = raw_act,
      lng = ~lon, lat = ~lat,
      color = "red", weight = 3, opacity = 0.6,
      group = "Raw Track"
    ) %>%
    # Cleaned track (blue)
    addPolylines(
      data = clean_act,
      lng = ~lon, lat = ~lat,
      color = "blue", weight = 3, opacity = 0.8,
      group = "Cleaned Track"
    ) %>%
    # Add layer control
    addLayersControl(
      overlayGroups = c("Raw Track", "Cleaned Track"),
      options = layersControlOptions(collapsed = FALSE)
    ) %>%
    # Fit bounds to show entire track
    fitBounds(
      lng1 = min(raw_act$lon), lat1 = min(raw_act$lat),
      lng2 = max(raw_act$lon), lat2 = max(raw_act$lat)
    )

  return(map)
}

# Create distance-based intervals (0.1 mile buckets)
create_distance_intervals <- function(segments_data, interval_distance_mi = 0.1) {
  segments_data %>%
    group_by(activity_id) %>%
    arrange(start_time) %>%
    mutate(
      # Calculate cumulative distance
      cumulative_distance_mi = cumsum(distance_3d_mi),
      # Assign to interval (0.1 mile buckets)
      distance_interval = floor(cumulative_distance_mi / interval_distance_mi)
    ) %>%
    # Aggregate by interval
    group_by(activity_id, distance_interval) %>%
    summarise(
      # Time metrics
      total_time_sec = sum(time_delta_sec, na.rm = TRUE),
      interval_start_time = first(start_time_local),

      # Distance metrics (should be ~0.1 mi per interval)
      interval_distance_mi = sum(distance_3d_mi, na.rm = TRUE),
      cumulative_distance_mi = first(cumulative_distance_mi),

      # Elevation metrics
      elevation_gain_ft = sum(elevation_delta_ft[elevation_delta_ft > 0], na.rm = TRUE),
      elevation_loss_ft = abs(sum(elevation_delta_ft[elevation_delta_ft < 0], na.rm = TRUE)),
      net_elevation_change_ft = sum(elevation_delta_ft, na.rm = TRUE),
      start_elevation_ft = first(start_elevation_ft),
      end_elevation_ft = last(end_elevation_ft),

      # Speed/pace (time-weighted averages)
      avg_speed_mph = weighted.mean(speed_mph, w = time_delta_sec, na.rm = TRUE),
      avg_grade_percent = weighted.mean(grade_percent, w = time_delta_sec, na.rm = TRUE),
      avg_pace_min_mi = weighted.mean(pace_min_mi, w = time_delta_sec, na.rm = TRUE),

      # Segment count
      n_segments = n(),

      .groups = "drop"
    )
}

## load data ----

message("Loading GPS data...")
long_points_data <- read.csv("scratch/clean_data/long_points_data.csv")
long_segments_data <- read.csv("scratch/clean_data/long_segments_data.csv")

message(paste("Loaded", nrow(long_points_data), "points and", nrow(long_segments_data), "segments"))

## clean data ----

message("\n=== Starting GPS Data Cleaning ===")
cleaned_data <- clean_gps_outliers(long_points_data, long_segments_data, speed_threshold_mph = 20)
clean_points_data <- cleaned_data$points
clean_segments_data <- cleaned_data$segments

message(paste("\nMax speed in cleaned data:", round(max(clean_segments_data$speed_mph, na.rm = TRUE), 2), "mph"))

## visualize cleaning ----

message("\n=== Creating Validation Maps ===")

# Create validation_maps directory if it doesn't exist
if (!dir.exists("scratch/validation_maps")) {
  dir.create("scratch/validation_maps")
  message("Created scratch/validation_maps/ directory")
}

# Get list of activities to visualize
activities_to_map <- unique(clean_points_data$activity_id)

# Create maps for each activity
for (act_id in activities_to_map) {
  message(paste("Creating map for activity:", act_id))

  map <- visualize_gps_cleaning(long_points_data, clean_points_data, activity_id = act_id)

  map_file <- paste0("scratch/validation_maps/activity_", act_id, ".html")
  saveWidget(map, map_file, selfcontained = TRUE)

  message(paste("  Saved to:", map_file))
}

# View a specific activity map
browseURL("scratch/validation_maps/activity_23732307020.html")

# Or view the first map
map_files <- list.files("scratch/validation_maps", pattern = "\\.html$", full.names = TRUE)
browseURL(map_files[1])


## create distance intervals ----

message("\n=== Creating Distance-Based Intervals ===")
distance_intervals <- create_distance_intervals(clean_segments_data, interval_distance_mi = 0.1)

message(paste("Created", nrow(distance_intervals), "distance intervals"))

## save cleaned data ----

message("\n=== Saving Cleaned Data ===")
write.csv(clean_points_data, "scratch/clean_data/clean_points_data.csv", row.names = FALSE)
message("Saved: scratch/clean_data/clean_points_data.csv")

write.csv(clean_segments_data, "scratch/clean_data/clean_segments_data.csv", row.names = FALSE)
message("Saved: scratch/clean_data/clean_segments_data.csv")

write.csv(distance_intervals, "scratch/clean_data/distance_intervals.csv", row.names = FALSE)
message("Saved: scratch/clean_data/distance_intervals.csv")

message("\n=== Distance-Based Analysis Complete ===")
message(paste("Points removed:", nrow(long_points_data) - nrow(clean_points_data)))
message(paste("Validation maps:", length(activities_to_map), "files in scratch/validation_maps/"))
message(paste("Distance intervals created: 0.1 mile buckets"))
