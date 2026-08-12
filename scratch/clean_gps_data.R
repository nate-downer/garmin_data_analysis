## clean gps data

## libraries ----
library(xml2)
library(dplyr)
library(purrr)
library(tibble)
library(lubridate)
library(stringr)
library(ggplot2)
library(lutz)

# Set display options to show full precision
options(digits = 15)  # Show up to 15 significant digits
options(pillar.sigfig = 10)  # Show 10 significant figures in tibble display

## functions ----

# Calculate geodesic distance between two points using Haversine formula
# Accounts for Earth's curvature, accurate to within a few meters
# Returns distance in meters
haversine_distance <- function(lon1, lat1, lon2, lat2) {
  # Earth's radius in meters
  earth_radius_m <- 6371000

  # Convert degrees to radians
  lon1_rad <- lon1 * pi / 180
  lat1_rad <- lat1 * pi / 180
  lon2_rad <- lon2 * pi / 180
  lat2_rad <- lat2 * pi / 180

  # Calculate differences
  dlon <- lon2_rad - lon1_rad
  dlat <- lat2_rad - lat1_rad

  # Haversine formula
  a <- sin(dlat/2)^2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon/2)^2
  c <- 2 * asin(sqrt(a))

  # Distance in meters
  distance <- earth_radius_m * c

  return(distance)
}

# Extract activity ID from GPX filename
extract_activity_id <- function(filepath) {
  str_extract(basename(filepath), "(?<=activity_)\\d+")
}

# Parse a single GPX file and return a data frame of trackpoints
parse_gpx_file <- function(filepath) {
  # Read XML
  gpx <- read_xml(filepath)

  # Extract activity ID from filename
  activity_id <- extract_activity_id(filepath)

  # Find all trackpoints
  ns <- xml_ns(gpx)
  trackpoints <- xml_find_all(gpx, ".//d1:trkpt", ns)

  if (length(trackpoints) == 0) {
    warning(paste("No trackpoints found in", filepath))
    return(tibble())
  }

  # Extract data from each trackpoint with full precision
  tibble(
    activity_id = activity_id,
    lat = as.double(xml_attr(trackpoints, "lat")),
    lon = as.double(xml_attr(trackpoints, "lon")),
    elevation_m = as.double(xml_text(xml_find_first(trackpoints, ".//d1:ele", ns))),
    elevation_ft = elevation_m * 3.28084,
    time = ymd_hms(xml_text(xml_find_first(trackpoints, ".//d1:time", ns)))
  )
}

# Parse all GPX files in a directory
parse_all_gpx_files <- function(directory) {
  # Find all GPX files
  gpx_files <- list.files(directory, pattern = "activity_.*\\.gpx$", full.names = TRUE)

  if (length(gpx_files) == 0) {
    stop(paste("No GPX files found in", directory))
  }

  message(paste("Found", length(gpx_files), "GPX file(s)"))

  # Parse each file and combine into one data frame
  gpx_files %>%
    map(parse_gpx_file) %>%
    bind_rows()
}

# Extract metadata from a single GPX file
extract_gpx_metadata <- function(filepath) {
  # Read XML
  gpx <- read_xml(filepath)

  # Extract activity ID from filename
  activity_id <- extract_activity_id(filepath)

  # Find namespaces
  ns <- xml_ns(gpx)

  # Extract metadata fields
  activity_name <- xml_text(xml_find_first(gpx, ".//d1:name", ns))
  activity_type <- xml_text(xml_find_first(gpx, ".//d1:type", ns))

  # If name or type are missing, set to NA
  if (length(activity_name) == 0 || activity_name == "") activity_name <- NA_character_
  if (length(activity_type) == 0 || activity_type == "") activity_type <- NA_character_

  tibble(
    activity_id = activity_id,
    activity_name = activity_name,
    activity_type = activity_type
  )
}

# Extract metadata from all GPX files in a directory
extract_all_gpx_metadata <- function(directory) {
  # Find all GPX files
  gpx_files <- list.files(directory, pattern = "activity_.*\\.gpx$", full.names = TRUE)

  if (length(gpx_files) == 0) {
    stop(paste("No GPX files found in", directory))
  }

  # Extract metadata from each file
  gpx_files %>%
    map(extract_gpx_metadata) %>%
    bind_rows()
}

# Calculate segments between consecutive GPS points
# Returns a data frame where each row represents the segment from point i to point i+1
calculate_segments <- function(gps_data) {
  gps_data %>%
    group_by(activity_id) %>%
    arrange(time) %>%
    mutate(
      # Get next point's coordinates
      next_lat = lead(lat),
      next_lon = lead(lon),
      next_elevation_m = lead(elevation_m),
      next_elevation_ft = lead(elevation_ft),
      next_time = lead(time),

      # Calculate time difference in seconds
      time_delta_sec = as.numeric(difftime(next_time, time, units = "secs")),

      # Calculate elevation change
      elevation_delta_m = next_elevation_m - elevation_m,
      elevation_delta_ft = next_elevation_ft - elevation_ft,

      # Get the activity start time
      activity_start_time = min(time),
      activity_end_time = max(time),
      elapsed_time = time - activity_start_time
    ) %>%
    # Remove last point in each activity (has no "next" point)
    filter(!is.na(next_lat)) %>%
    mutate(
      # Calculate horizontal distance using Haversine formula (accounts for Earth's curvature)
      horizontal_distance_m = haversine_distance(lon, lat, next_lon, next_lat),
      horizontal_distance_ft = horizontal_distance_m * 3.28084,
      horizontal_distance_mi = horizontal_distance_m * 0.000621371,

      # Calculate 3D distance incorporating elevation change
      # Uses Pythagorean theorem: sqrt(horizontal^2 + vertical^2)
      distance_3d_m = sqrt(horizontal_distance_m^2 + elevation_delta_m^2),
      distance_3d_ft = distance_3d_m * 3.28084,
      distance_3d_mi = distance_3d_m * 0.000621371,

      # Calculate speed
      speed_ms = if_else(time_delta_sec > 0, distance_3d_m / time_delta_sec, NA_real_),
      speed_kmh = speed_ms * 3.6,
      speed_mph = speed_ms * 2.23694,

      # Calculate pace
      pace_min_km = if_else(speed_ms > 0, 1000 / (speed_ms * 60), NA_real_),
      pace_min_mi = if_else(speed_ms > 0, 1609.34 / (speed_ms * 60), NA_real_),

      # Calculate grade (elevation change / horizontal distance * 100)
      grade_percent = if_else(horizontal_distance_m > 0,
                              (elevation_delta_m / horizontal_distance_m) * 100,
                              NA_real_)
    ) %>%
    ungroup() %>%
    # Keep relevant columns for segments
    select(
      activity_id,
      activity_start_time,
      activity_end_time,
      # Start point
      start_time = time,
      start_lat = lat,
      start_lon = lon,
      start_elevation_m = elevation_m,
      start_elevation_ft = elevation_ft,
      # End point
      end_time = next_time,
      end_lat = next_lat,
      end_lon = next_lon,
      end_elevation_m = next_elevation_m,
      end_elevation_ft = next_elevation_ft,
      # Time metrics
      time_delta_sec,
      elapsed_time,
      # Elevation deltas
      elevation_delta_m,
      elevation_delta_ft,
      # Horizontal distances
      horizontal_distance_m,
      horizontal_distance_ft,
      horizontal_distance_mi,
      # 3D distances
      distance_3d_m,
      distance_3d_ft,
      distance_3d_mi,
      # Speed
      speed_ms,
      speed_kmh,
      speed_mph,
      # Pace
      pace_min_km,
      pace_min_mi,
      # Grade
      grade_percent
    )
}

## load data ----

# Set the directory containing GPX files
gpx_directory <- "raw_garmin_data"

# Parse all GPX files into a long data frame
long_points_data <- parse_all_gpx_files(gpx_directory)

# Calculate segments between consecutive points
long_segments_data <- calculate_segments(long_points_data)

# Extract GPX metadata for all activities
gpx_metadata <- extract_all_gpx_metadata(gpx_directory)

# Calculate aggregate statistics from segments data
activity_stats <- long_segments_data %>%
  group_by(activity_id) %>%
  summarise(
    # Time metrics
    date = as.Date(min(start_time, na.rm = TRUE)),
    start_time = min(start_time, na.rm = TRUE),
    end_time = max(end_time, na.rm = TRUE),
    total_duration_sec = sum(time_delta_sec, na.rm = TRUE),
    total_duration_min = total_duration_sec / 60,
    total_duration_hr = total_duration_min / 60,

    # Distance metrics
    total_distance_mi = sum(distance_3d_mi, na.rm = TRUE),
    total_distance_ft = sum(distance_3d_ft, na.rm = TRUE),
    total_horizontal_distance_mi = sum(horizontal_distance_mi, na.rm = TRUE),

    # Elevation metrics
    total_elevation_gain_ft = sum(elevation_delta_ft[elevation_delta_ft > 0], na.rm = TRUE),
    total_elevation_loss_ft = abs(sum(elevation_delta_ft[elevation_delta_ft < 0], na.rm = TRUE)),
    net_elevation_change_ft = sum(elevation_delta_ft, na.rm = TRUE),
    max_elevation_ft = max(end_elevation_ft, na.rm = TRUE),
    min_elevation_ft = min(start_elevation_ft, na.rm = TRUE),
    elevation_range_ft = max_elevation_ft - min_elevation_ft,

    # Speed and pace metrics (weighted by time)
    avg_speed_mph = weighted.mean(speed_mph, w = time_delta_sec, na.rm = TRUE),
    max_speed_mph = max(speed_mph, na.rm = TRUE),
    avg_pace_min_mi = if_else(total_distance_mi > 0,
                              total_duration_min / total_distance_mi,
                              NA_real_),

    # Grade metrics
    avg_grade_percent = weighted.mean(grade_percent, w = time_delta_sec, na.rm = TRUE),
    max_grade_percent = max(grade_percent, na.rm = TRUE),
    min_grade_percent = min(grade_percent, na.rm = TRUE),

    # Segment count
    n_segments = n(),

    .groups = "drop"
  )

# Get representative coordinates for timezone lookup (using first trackpoint)
activity_coords <- long_points_data %>%
  group_by(activity_id) %>%
  slice(1) %>%
  ungroup() %>%
  select(activity_id, lat, lon) %>%
  # Ensure coordinates are numeric and filter out any invalid values
  filter(!is.na(lat), !is.na(lon),
         lat >= -90, lat <= 90,
         lon >= -180, lon <= 180) %>%
  rowwise() %>%
  mutate(
    # Lookup timezone from coordinates (lat, lon order for lutz)
    timezone = tz_lookup_coords(lat, lon, method = "accurate")
  ) %>%
  ungroup()

# Add local time to segments data
# Process by activity for efficiency while maintaining accuracy
long_segments_data <- long_segments_data %>%
  # Join timezone data
  left_join(activity_coords %>% select(activity_id, timezone), by = "activity_id") %>%
  # Split by activity, convert times, then combine
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
          # Parse as UTC and convert to local timezone
          start_time_local_dt = with_tz(ymd_hms(start_time, tz = "UTC"), tz),
          end_time_local_dt = with_tz(ymd_hms(end_time, tz = "UTC"), tz),
          # Format as strings and extract hour
          start_time_local = format(start_time_local_dt, "%Y-%m-%d %H:%M:%S"),
          end_time_local = format(end_time_local_dt, "%Y-%m-%d %H:%M:%S"),
          start_hour_local = hour(start_time_local_dt)
        ) %>%
        select(-start_time_local_dt, -end_time_local_dt)
    }
  }) %>%
  # Reorder columns to place local times near UTC times
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

# Combine metadata and statistics
activity_metadata <- gpx_metadata %>%
  left_join(activity_stats, by = "activity_id") %>%
  # Join timezone data
  left_join(activity_coords %>% select(activity_id, timezone), by = "activity_id") %>%
  mutate(
    # Convert UTC start_time to local time based on timezone
    start_time_utc = start_time,  # Preserve original UTC time
    start_time_local = map2_chr(start_time_utc, timezone, function(time, tz) {
      if (is.na(tz)) return(NA_character_)
      format(with_tz(ymd_hms(time), tz), "%Y-%m-%d %H:%M:%S")
    }),
    # Extract local hour for time-of-day analysis
    start_hour_local = hour(ymd_hms(start_time_local))
  ) %>%
  select(
    # Identifiers
    activity_id,
    activity_name,
    activity_type,
    # Time
    date,
    start_time_utc,
    start_time_local,
    start_hour_local,
    timezone,
    end_time,
    total_duration_sec,
    total_duration_min,
    total_duration_hr,
    # Distance
    total_distance_mi,
    total_distance_ft,
    total_horizontal_distance_mi,
    # Elevation
    total_elevation_gain_ft,
    total_elevation_loss_ft,
    net_elevation_change_ft,
    max_elevation_ft,
    min_elevation_ft,
    elevation_range_ft,
    # Speed/Pace
    avg_speed_mph,
    max_speed_mph,
    avg_pace_min_mi,
    # Grade
    avg_grade_percent,
    max_grade_percent,
    min_grade_percent,
    # Other
    n_segments
  )

# Preview the data
# View(long_points_data)
# View(long_segments_data)
View(activity_metadata)

# Write all three main tables to CSV
long_points_data %>%
  write.csv("scratch/clean_data/long_points_data.csv", row.names = FALSE)

long_segments_data %>%
  write.csv("scratch/clean_data/long_segments_data.csv", row.names = FALSE)

activity_metadata %>%
  write.csv("scratch/clean_data/activity_metadata.csv", row.names = FALSE)

## basic plots ----

# long_points_data %>%
#   filter(activity_id == 17113078620) %>%
#   ggplot(aes(x = time, y = elevation_ft)) +
#   geom_line() +
#   labs(y = "Elevation (feet)")

# long_segments_data %>%
#   filter(activity_id == 17113078620) %>%
#   ggplot(aes(x = start_time, y = speed_mph)) +
#   geom_point(alpha = 0.2) +
#   geom_smooth() +
#   labs(y = "Speed (mph)")

long_segments_data %>%
  ggplot(aes(x = elapsed_time / 3600, y = start_elevation_ft, color = activity_id)) +
  geom_line() +
  scale_y_continuous(labels = scales::comma, breaks = c(seq(0, 16000, 2000))) +
  labs(
    title = "Elevation Over Time For Major Activities",
    x = "Elapsed Time (Hours)",
    y = "Elevation (Feet)"
  ) +
  theme_minimal() +
  theme(legend.position = "none")

# Elevation by time of day (local time)
long_segments_data %>%
  mutate(
    # Extract hour of day with decimals for smoother plotting
    hour_of_day = hour(ymd_hms(start_time_local)) + minute(ymd_hms(start_time_local)) / 60
  ) %>%
  filter(!is.na(hour_of_day)) %>%
  ggplot(aes(x = hour_of_day, y = start_elevation_ft, color = activity_id)) +
  geom_point(size = 0.2) +
  scale_x_continuous(breaks = seq(0, 24, 2), limits = c(0, 24)) +
  scale_y_continuous(labels = scales::comma, breaks = seq(0, 16000, 2000)) +
  labs(
    title = "Elevation by Time of Day (Local Time)",
    subtitle = "Shows what time of day you were at different elevations",
    x = "Time of Day (Hour)",
    y = "Elevation (Feet)"
  ) +
  theme_minimal() +
  theme(legend.position = "none")

