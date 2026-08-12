## Deep Dive: Activity 19574407134

## libraries ----
library(dplyr)
library(zoo)
library(leaflet)
library(htmlwidgets)
library(ggplot2)
library(lubridate)
library(tidyr)
library(scales)

## load data ----
long_points_data <- read.csv("scratch/clean_data/long_points_data.csv")

## filter activity ----
activity_id <- 19574407134
activity_points <- long_points_data %>%
  filter(activity_id == !!activity_id) %>%
  arrange(time)

message(paste("Activity has", nrow(activity_points), "GPS points"))

## calculate rolling average (50-point window) ----
activity_points_smoothed <- activity_points %>%
  mutate(
    # Calculate rolling mean of lat/lon over last 50 points
    # align = "right" means the window includes current point and 49 previous
    lat_smooth = rollmean(lat, k = 50, fill = NA, align = "right"),
    lon_smooth = rollmean(lon, k = 50, fill = NA, align = "right")
  ) %>%
  # Remove NA values (first 49 points won't have full window)
  filter(!is.na(lat_smooth), !is.na(lon_smooth))

message(paste("Smoothed track has", nrow(activity_points_smoothed), "points (after removing first 49)"))

## create map with both traces ----
map <- leaflet() %>%
  addTiles() %>%
  # Raw GPS track (red, thin, semi-transparent)
  addPolylines(
    data = activity_points,
    lng = ~lon, lat = ~lat,
    color = "red", weight = 2, opacity = 0.5,
    group = "Raw GPS Track"
  ) %>%
  # Smoothed track (blue, thicker, more opaque)
  addPolylines(
    data = activity_points_smoothed,
    lng = ~lon_smooth, lat = ~lat_smooth,
    color = "blue", weight = 3, opacity = 0.8,
    group = "Smoothed (50-point avg)"
  ) %>%
  # Add markers at start and end
  addCircleMarkers(
    data = activity_points %>% slice(1),
    lng = ~lon, lat = ~lat,
    color = "green", radius = 8,
    popup = "Start"
  ) %>%
  addCircleMarkers(
    data = activity_points %>% slice(n()),
    lng = ~lon, lat = ~lat,
    color = "red", radius = 8,
    popup = "End"
  ) %>%
  # Layer controls
  addLayersControl(
    overlayGroups = c("Raw GPS Track", "Smoothed (50-point avg)"),
    options = layersControlOptions(collapsed = FALSE)
  ) %>%
  # Fit to bounds
  fitBounds(
    lng1 = min(activity_points$lon), lat1 = min(activity_points$lat),
    lng2 = max(activity_points$lon), lat2 = max(activity_points$lat)
  )

## save and view map ----
map_file <- "scratch/scratch/validation_maps/activity_19574407134_deep_dive.html"
saveWidget(map, map_file, selfcontained = TRUE)
message(paste("\nMap saved to:", map_file))
message("Opening in browser...")
browseURL(map_file)

## show map in R (if using RStudio/IDE with HTML viewer)
map

## analyze GPS noise over time ----

# Define haversine distance function (same as in clean_gps_data.R)
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

# Calculate distance between raw and smoothed positions
noise_analysis <- activity_points_smoothed %>%
  mutate(
    # Distance between raw and smoothed position (in meters)
    gps_noise_m = haversine_distance(lon, lat, lon_smooth, lat_smooth),
    # Convert to feet for consistency with other metrics
    gps_noise_ft = gps_noise_m * 3.28084,
    # Parse time for plotting
    timestamp = ymd_hms(time),
    # Calculate elapsed time in minutes
    elapsed_min = as.numeric(difftime(timestamp, min(timestamp), units = "mins"))
  )

# Summary statistics
message("\n=== GPS Noise Analysis ===")
message(paste("Mean GPS noise:", round(mean(noise_analysis$gps_noise_ft), 2), "feet"))
message(paste("Median GPS noise:", round(median(noise_analysis$gps_noise_ft), 2), "feet"))
message(paste("Max GPS noise:", round(max(noise_analysis$gps_noise_ft), 2), "feet"))
message(paste("95th percentile:", round(quantile(noise_analysis$gps_noise_ft, 0.95), 2), "feet"))

# Create plot of GPS noise over time
noise_plot <- noise_analysis %>%
  ggplot(aes(x = elapsed_min, y = gps_noise_ft)) +
  geom_line(color = "steelblue", alpha = 0.6) +
  geom_point(color = "steelblue", alpha = 0.3, size = 0.5) +
  geom_smooth(method = "loess", color = "red", se = TRUE, alpha = 0.2) +
  geom_hline(yintercept = mean(noise_analysis$gps_noise_ft),
             linetype = "dashed", color = "darkgreen", linewidth = 1) +
  labs(
    title = "GPS Noise Over Time - Activity 19574407134",
    subtitle = "Distance between raw GPS position and 50-point rolling average",
    x = "Elapsed Time (minutes)",
    y = "GPS Noise (feet)",
    caption = paste("Mean:", round(mean(noise_analysis$gps_noise_ft), 2), "ft  |  ",
                   "Median:", round(median(noise_analysis$gps_noise_ft), 2), "ft  |  ",
                   "Max:", round(max(noise_analysis$gps_noise_ft), 2), "ft")
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(face = "bold", size = 14),
    plot.subtitle = element_text(color = "gray40"),
    plot.caption = element_text(hjust = 0.5, color = "gray50")
  )

# Display plot
print(noise_plot)

# Save plot
ggsave("scratch/scratch/validation_maps/activity_19574407134_noise_analysis.png",
       noise_plot, width = 10, height = 6, dpi = 300)
message("\nPlot saved to: scratch/scratch/validation_maps/activity_19574407134_noise_analysis.png")

## analyze relationship between speed and GPS noise ----

# Load segments data to get speed information
long_segments_data <- read.csv("scratch/clean_data/long_segments_data.csv")

# Get segments for this activity
activity_segments <- long_segments_data %>%
  filter(activity_id == !!activity_id) %>%
  arrange(start_time)

# Calculate rolling average speed (50-point window)
activity_segments_with_rolling <- activity_segments %>%
  mutate(
    rolling_avg_speed_mph = rollmean(speed_mph, k = 50, fill = NA, align = "right"),
    timestamp = ymd_hms(start_time)
  )

# Join noise data with speed data by matching timestamps
speed_noise_analysis <- noise_analysis %>%
  inner_join(
    activity_segments_with_rolling %>% select(timestamp, rolling_avg_speed_mph, speed_mph),
    by = "timestamp"
  ) %>%
  filter(!is.na(rolling_avg_speed_mph))

message("\n=== Speed vs Noise Correlation ===")
correlation <- cor(speed_noise_analysis$rolling_avg_speed_mph, speed_noise_analysis$gps_noise_ft, use = "complete.obs")
message(paste("Correlation between speed and noise:", round(correlation, 3)))

# Create scatter plot with trend
speed_noise_plot <- speed_noise_analysis %>%
  ggplot(aes(x = rolling_avg_speed_mph, y = gps_noise_ft)) +
  geom_point(alpha = 0.3, color = "steelblue", size = 1.5) +
  geom_smooth(method = "lm", color = "red", se = TRUE, linewidth = 1.5) +
  # Add vertical line at typical hiking speed (3 mph)
  geom_vline(xintercept = 3, linetype = "dashed", color = "darkgreen", alpha = 0.5) +
  annotate("text", x = 3.5, y = max(speed_noise_analysis$gps_noise_ft) * 0.9,
           label = "Typical hiking\nspeed (~3 mph)", hjust = 0, color = "darkgreen", size = 3) +
  labs(
    title = "GPS Noise vs Speed - Activity 19574407134",
    subtitle = paste0("Relationship between movement speed and GPS measurement error\n",
                     "Correlation: ", round(correlation, 3)),
    x = "Rolling Average Speed (mph, 50-point window)",
    y = "GPS Noise (feet)",
    caption = "Lower speeds may require tighter GPS filtering due to increased noise"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(face = "bold", size = 14),
    plot.subtitle = element_text(color = "gray40"),
    plot.caption = element_text(hjust = 0, color = "gray50", face = "italic")
  )

# Display plot
print(speed_noise_plot)

# Save plot
ggsave("scratch/validation_maps/activity_19574407134_speed_vs_noise.png",
       speed_noise_plot, width = 10, height = 6, dpi = 300)
message("\nPlot saved to: scratch/validation_maps/activity_19574407134_speed_vs_noise.png")

# Summary statistics by speed range
speed_ranges <- speed_noise_analysis %>%
  mutate(
    speed_category = case_when(
      rolling_avg_speed_mph < 2 ~ "Very Slow (< 2 mph)",
      rolling_avg_speed_mph < 4 ~ "Slow (2-4 mph)",
      rolling_avg_speed_mph < 6 ~ "Moderate (4-6 mph)",
      TRUE ~ "Fast (> 6 mph)"
    )
  ) %>%
  group_by(speed_category) %>%
  summarise(
    n_points = n(),
    mean_noise_ft = mean(gps_noise_ft),
    median_noise_ft = median(gps_noise_ft),
    max_noise_ft = max(gps_noise_ft),
    .groups = "drop"
  ) %>%
  arrange(speed_category)

message("\n=== GPS Noise by Speed Range ===")
print(speed_ranges)

## plot GPS noise residuals over time ----

# Fit LOESS model to predict expected noise based on speed
loess_model <- loess(gps_noise_ft ~ rolling_avg_speed_mph, data = speed_noise_analysis)

# Calculate expected noise and residuals
speed_noise_analysis <- speed_noise_analysis %>%
  mutate(
    # Predicted noise based on speed
    expected_noise_ft = predict(loess_model, newdata = .),
    # Residual: actual noise - expected noise
    noise_residual_ft = gps_noise_ft - expected_noise_ft,
    # Absolute residual for identifying worst outliers
    abs_residual_ft = abs(noise_residual_ft)
  ) %>%
  mutate(
    # Calculate rolling baseline and variability (50-point window)
    rolling_mean_residual = rollmean(noise_residual_ft, k = 50, fill = NA, align = "center"),
    rolling_sd_residual = rollapply(noise_residual_ft, width = 50, FUN = sd, fill = NA, align = "center"),

    # Dynamic thresholds that adapt to local conditions
    upper_threshold = rolling_mean_residual + 2 * rolling_sd_residual,
    lower_threshold = rolling_mean_residual - 2 * rolling_sd_residual,

    # Fill NA values at edges with global values
    upper_threshold = if_else(is.na(upper_threshold),
                              mean(noise_residual_ft) + 2 * sd(noise_residual_ft),
                              upper_threshold),
    lower_threshold = if_else(is.na(lower_threshold),
                              mean(noise_residual_ft) - 2 * sd(noise_residual_ft),
                              lower_threshold),

    # Flag outliers using dynamic thresholds
    is_outlier = noise_residual_ft > upper_threshold | noise_residual_ft < lower_threshold
  )

# Summary of residuals
message("\n=== Noise Residuals Analysis (with adaptive thresholds) ===")
message(paste("Mean residual:", round(mean(speed_noise_analysis$noise_residual_ft), 2), "ft (should be ~0)"))
message(paste("Global std dev:", round(sd(speed_noise_analysis$noise_residual_ft), 2), "ft"))
message(paste("Max positive residual:", round(max(speed_noise_analysis$noise_residual_ft), 2), "ft"))
message(paste("Max negative residual:", round(min(speed_noise_analysis$noise_residual_ft), 2), "ft"))

# Identify outlier points using dynamic thresholds
outliers <- speed_noise_analysis %>%
  filter(is_outlier)

message(paste("Points with unusually high noise:", nrow(outliers)))

# Create time series plot of residuals with dynamic thresholds
residual_plot <- speed_noise_analysis %>%
  ggplot(aes(x = elapsed_min, y = noise_residual_ft)) +
  # Zero line (expected)
  geom_hline(yintercept = 0, linetype = "solid", color = "gray50") +
  # Dynamic threshold bands (shaded region)
  geom_ribbon(aes(ymin = lower_threshold, ymax = upper_threshold),
              fill = "gray80", alpha = 0.3) +
  # Dynamic threshold lines
  geom_line(aes(y = upper_threshold), color = "red", linetype = "dashed", alpha = 0.7) +
  geom_line(aes(y = lower_threshold), color = "red", linetype = "dashed", alpha = 0.7) +
  # Residual data
  geom_line(color = "steelblue", alpha = 0.6) +
  geom_point(color = "steelblue", alpha = 0.3, size = 0.5) +
  # Highlight outlier points (those outside dynamic thresholds)
  geom_point(data = outliers, aes(x = elapsed_min, y = noise_residual_ft),
             color = "red", size = 2, alpha = 0.7) +
  # Rolling mean trend
  geom_line(aes(y = rolling_mean_residual), color = "darkgreen", linewidth = 1) +
  labs(
    title = "GPS Noise Residuals with Adaptive Thresholds - Activity 19574407134",
    subtitle = paste0("Actual noise minus expected noise (based on speed)\n",
                     "Red dashed lines: Dynamic ±2 SD thresholds (50-point rolling window)\n",
                     "Gray band: Expected normal range | Green line: Rolling mean residual"),
    x = "Elapsed Time (minutes)",
    y = "Noise Residual (feet)\n(Actual - Expected)",
    caption = paste("Outlier points:", nrow(outliers), "| Adaptive thresholds prevent over-filtering during fast movement")
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(face = "bold", size = 13),
    plot.subtitle = element_text(color = "gray40", size = 9),
    plot.caption = element_text(hjust = 0, color = "gray50", size = 8)
  )

# Display plot
print(residual_plot)

# Save plot
ggsave("scratch/validation_maps/activity_19574407134_noise_residuals.png",
       residual_plot, width = 10, height = 6, dpi = 300)
message("\nPlot saved to: scratch/validation_maps/activity_19574407134_noise_residuals.png")

# Show when outliers occurred
if (nrow(outliers) > 0) {
  message("\n=== Outlier Time Periods ===")
  outlier_summary <- outliers %>%
    summarise(
      first_outlier_min = min(elapsed_min),
      last_outlier_min = max(elapsed_min),
      mean_speed_mph = mean(rolling_avg_speed_mph),
      mean_actual_noise_ft = mean(gps_noise_ft),
      mean_expected_noise_ft = mean(expected_noise_ft)
    )
  print(outlier_summary)
}

## combined noise analysis: location and speed ----

# Calculate speed noise (deviation from rolling average)
combined_noise <- speed_noise_analysis %>%
  mutate(
    # Speed noise: difference between instantaneous and rolling average speed
    speed_noise_mph = abs(speed_mph - rolling_avg_speed_mph),

    # Calculate rolling statistics for both noise types (using same 50-point window)
    # Location noise statistics
    rolling_mean_location = rollmean(gps_noise_ft, k = 50, fill = NA, align = "center"),
    rolling_sd_location = rollapply(gps_noise_ft, width = 50, FUN = sd, fill = NA, align = "center"),

    # Speed noise statistics
    rolling_mean_speed = rollmean(speed_noise_mph, k = 50, fill = NA, align = "center"),
    rolling_sd_speed = rollapply(speed_noise_mph, width = 50, FUN = sd, fill = NA, align = "center"),

    # Fill NAs at edges with global values
    rolling_mean_location = if_else(is.na(rolling_mean_location), mean(gps_noise_ft), rolling_mean_location),
    rolling_sd_location = if_else(is.na(rolling_sd_location), sd(gps_noise_ft), rolling_sd_location),
    rolling_mean_speed = if_else(is.na(rolling_mean_speed), mean(speed_noise_mph), rolling_mean_speed),
    rolling_sd_speed = if_else(is.na(rolling_sd_speed), sd(speed_noise_mph), rolling_sd_speed),

    # Calculate z-scores (standardized deviation from rolling mean)
    location_z = (gps_noise_ft - rolling_mean_location) / rolling_sd_location,
    speed_z = (speed_noise_mph - rolling_mean_speed) / rolling_sd_speed,

    # Flag outliers (> 2 SD from rolling mean)
    location_outlier = abs(location_z) > 2,
    speed_outlier = abs(speed_z) > 2,

    # Combined outlier flag
    outlier_type = case_when(
      location_outlier & speed_outlier ~ "Both",
      location_outlier ~ "Location only",
      speed_outlier ~ "Speed only",
      TRUE ~ "Normal"
    )
  )

# Summary of outliers by type
outlier_counts <- combined_noise %>%
  count(outlier_type) %>%
  mutate(pct = round(n / sum(n) * 100, 1))

message("\n=== Combined Noise Analysis ===")
message("Outlier counts by type:")
print(outlier_counts)

# Reshape data for plotting both noise types
combined_noise_long <- combined_noise %>%
  select(elapsed_min, gps_noise_ft, speed_noise_mph, outlier_type) %>%
  pivot_longer(
    cols = c(gps_noise_ft, speed_noise_mph),
    names_to = "noise_type",
    values_to = "noise_value"
  ) %>%
  mutate(
    noise_type = if_else(noise_type == "gps_noise_ft",
                        "Location Noise (feet)",
                        "Speed Noise (mph)")
  )

# Prepare data for faceted plot (outlier_type is already in combined_noise_long)
plot_data <- combined_noise_long

# Create faceted plot with separate panels for each noise type
combined_plot <- ggplot(plot_data, aes(x = elapsed_min, y = noise_value)) +
  # Base noise line and points
  geom_line(color = "steelblue", alpha = 0.6) +
  geom_point(color = "steelblue", alpha = 0.2, size = 0.5) +

  # Highlight outliers with different colors by type
  geom_point(
    data = plot_data %>% filter(
      (noise_type == "Location Noise (feet)" & outlier_type == "Location only") |
      (noise_type == "Speed Noise (mph)" & outlier_type == "Speed only")
    ),
    color = "#E69F00", size = 2, alpha = 0.7
  ) +

  # Highlight points that are outliers in BOTH metrics (most severe)
  geom_point(
    data = plot_data %>% filter(outlier_type == "Both"),
    color = "#D55E00", size = 3, alpha = 0.8, shape = 17
  ) +

  # Add smoothed trend line
  geom_smooth(method = "loess", color = "darkgreen", se = TRUE, alpha = 0.2, linewidth = 0.8) +

  # Facet by noise type (separate y-axis scales)
  facet_wrap(~noise_type, ncol = 1, scales = "free_y", strip.position = "left") +

  labs(
    title = "Combined GPS Noise Analysis - Activity 19574407134",
    subtitle = paste0("Location noise (position error) and Speed noise (speed variability)\n",
                     "Orange: Type-specific outliers | Red triangles: Outliers in BOTH metrics"),
    x = "Elapsed Time (minutes)",
    y = NULL,
    caption = {
      # Safely extract counts (return 0 if category doesn't exist)
      get_count <- function(type) {
        count <- outlier_counts$n[outlier_counts$outlier_type == type]
        if (length(count) == 0) return(0) else return(count)
      }
      paste0("Total outliers: ", sum(outlier_counts$n[outlier_counts$outlier_type != "Normal"]),
            " | Location only: ", get_count("Location only"),
            " | Speed only: ", get_count("Speed only"),
            " | Both: ", get_count("Both"))
    }
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(face = "bold", size = 13),
    plot.subtitle = element_text(color = "gray40", size = 9),
    plot.caption = element_text(hjust = 0, color = "gray50", size = 8),
    strip.placement = "outside",
    strip.text = element_text(face = "bold", size = 10)
  )

# Display plot
print(combined_plot)

# Save plot
ggsave("scratch/validation_maps/activity_19574407134_combined_noise.png",
       combined_plot, width = 12, height = 6, dpi = 300)
message("\nPlot saved to: scratch/validation_maps/activity_19574407134_combined_noise.png")

## three-metric noise analysis with 30-min rolling windows ----

# Estimate number of points in 30 minutes
# Calculate average time between points
avg_time_between_points <- mean(diff(as.numeric(combined_noise$timestamp)), na.rm = TRUE)
points_per_30min <- round(1800 / avg_time_between_points)  # 1800 seconds = 30 minutes
message(paste("\n30-minute window ≈", points_per_30min, "points"))

# Calculate elevation noise (need raw elevation data)
# Get elevation from points data
elevation_data <- activity_points %>%
  mutate(
    timestamp = ymd_hms(time),
    # Calculate rolling average elevation (30-min window)
    rolling_avg_elevation = rollmean(elevation_ft, k = min(points_per_30min, nrow(.)),
                                     fill = NA, align = "right"),
    # Elevation noise: deviation from smoothed elevation
    elevation_noise_ft = abs(elevation_ft - rolling_avg_elevation)
  ) %>%
  select(timestamp, elevation_ft, rolling_avg_elevation, elevation_noise_ft)

# Combine all three noise types
three_metric_noise <- combined_noise %>%
  select(timestamp, elapsed_min, gps_noise_ft, speed_noise_mph) %>%
  left_join(elevation_data, by = "timestamp") %>%
  filter(!is.na(elevation_noise_ft)) %>%
  mutate(
    # Calculate 30-min rolling statistics for each noise type
    # Location noise
    rolling_mean_location_30 = rollmean(gps_noise_ft, k = min(points_per_30min, n()),
                                        fill = NA, align = "center"),
    rolling_sd_location_30 = rollapply(gps_noise_ft, width = min(points_per_30min, n()),
                                       FUN = sd, fill = NA, align = "center"),

    # Speed noise
    rolling_mean_speed_30 = rollmean(speed_noise_mph, k = min(points_per_30min, n()),
                                     fill = NA, align = "center"),
    rolling_sd_speed_30 = rollapply(speed_noise_mph, width = min(points_per_30min, n()),
                                    FUN = sd, fill = NA, align = "center"),

    # Elevation noise
    rolling_mean_elevation_30 = rollmean(elevation_noise_ft, k = min(points_per_30min, n()),
                                         fill = NA, align = "center"),
    rolling_sd_elevation_30 = rollapply(elevation_noise_ft, width = min(points_per_30min, n()),
                                        FUN = sd, fill = NA, align = "center")
  ) %>%
  mutate(
    # Fill NAs at edges
    across(starts_with("rolling_mean_"), ~if_else(is.na(.), mean(cur_data()[[gsub("rolling_mean_", "", cur_column())]], na.rm = TRUE), .)),
    across(starts_with("rolling_sd_"), ~if_else(is.na(.), sd(cur_data()[[gsub("rolling_sd_", "", cur_column())]], na.rm = TRUE), .))
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
multi_outliers <- three_metric_noise %>% filter(multi_metric_outlier)
extreme_outliers <- three_metric_noise %>% filter(extreme_outlier)
message(paste("\n=== Three-Metric Noise Summary ==="))
message(paste("Extreme outliers (>5 SD in any metric):", nrow(extreme_outliers)))
message(paste("Multi-metric outliers (2+ at >2 SD):", nrow(multi_outliers)))
message(paste("All three metrics (>2 SD):", sum(three_metric_noise$outlier_count_2sd == 3)))

# Reshape for faceted plotting
three_metric_long <- three_metric_noise %>%
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

# Create three-panel plot
three_metric_plot <- ggplot(three_metric_long, aes(x = elapsed_min, y = noise_value)) +
  # Actual noise
  geom_line(color = "steelblue", alpha = 0.5) +
  geom_point(color = "steelblue", alpha = 0.2, size = 0.3) +

  # Rolling mean (30-min window)
  geom_line(aes(y = rolling_mean), color = "darkgreen", linewidth = 1) +

  # Highlight extreme outliers (5 SD threshold in any single metric)
  geom_point(
    data = three_metric_long %>% filter(outlier_category == "Extreme (>5 SD)"),
    aes(y = noise_value), color = "purple", size = 2.5, alpha = 0.8, shape = 18
  ) +

  # Highlight multi-metric outliers (2 SD threshold)
  geom_point(
    data = three_metric_long %>% filter(outlier_category == "Two metrics (>2 SD)"),
    aes(y = noise_value), color = "orange", size = 2, alpha = 0.7
  ) +
  geom_point(
    data = three_metric_long %>% filter(outlier_category == "All three (>2 SD)"),
    aes(y = noise_value), color = "red", size = 3, alpha = 0.8, shape = 17
  ) +

  # Facet by metric type
  facet_wrap(~metric_type, ncol = 1, scales = "free_y", strip.position = "left") +

  labs(
    title = "Three-Metric GPS Noise Analysis - Activity 19574407134",
    subtitle = paste0("30-minute rolling averages (green line)\n",
                     "Purple diamonds: >5 SD any metric | Orange: >2 SD 2 metrics | Red triangles: >2 SD all 3"),
    x = "Elapsed Time (minutes)",
    y = NULL,
    caption = paste0("Extreme outliers (>5 SD): ", nrow(extreme_outliers),
                    " | Multi-metric (2+ at >2 SD): ", nrow(multi_outliers),
                    " | All three (>2 SD): ", sum(three_metric_noise$outlier_count_2sd == 3),
                    " | Window: ~", round(points_per_30min), " points (30 min)")
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(face = "bold", size = 13),
    plot.subtitle = element_text(color = "gray40", size = 9),
    plot.caption = element_text(hjust = 0, color = "gray50", size = 8),
    strip.placement = "outside",
    strip.text = element_text(face = "bold", size = 10)
  )

# Display and save
print(three_metric_plot)
ggsave("scratch/validation_maps/activity_19574407134_three_metric_noise.png",
       three_metric_plot, width = 12, height = 8, dpi = 300)
message("\nPlot saved to: scratch/validation_maps/activity_19574407134_three_metric_noise.png")
