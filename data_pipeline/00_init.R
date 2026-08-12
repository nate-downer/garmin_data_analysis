## init - run data pipeline

## libraries ----

# Data manipulation
library(dplyr)
library(purrr)
library(tibble)
library(tidyr)

# Time/date handling
library(lubridate)
library(lutz)

# String operations
library(stringr)

# Statistical/math
library(zoo)

# Visualization
library(ggplot2)
library(leaflet)
library(htmlwidgets)
library(htmltools)
library(plotly)

# File parsing
library(xml2)



## global params ----

# Input/output paths
raw_gpx_dir <- "raw_garmin_data/nate_downer_full_data"  # Shared data source (at root)
clean_data_dir <- "data_pipeline/clean_data"            # Pipeline outputs
validation_dir <- "data_pipeline/outputs"       # HTML report outputs
models_dir <- "data_pipeline/models"                    # Saved models

# Route to predict time for
test_route <- "raw_garmin_data/test_routes/whitney_mountaineers_route"  

# Time prediction parameters
prediciton_start_time_of_day_h <- 03  # 3 am
prediction_activity_type <- "mountaineering"   # Activity type for predictions (hiking, running, mountaineering, etc.)


# Noise-based filtering thresholds
one_noise_metric_filter_threshold <- 4  # SD threshold for single metric (extreme outliers)
two_noise_metric_filter_threshold <- 2  # SD threshold for multi-metric outliers

# Noise calculation windows
point_filter_range <- 50              # Points for initial smoothing (location, speed)
time_filter_range_sec <- 30 * 60      # Seconds for rolling statistics (30 min)

# Absolute Max Speed
max_speed_mph <- 10                   # Filter out points where the speed exceeds this threshold

# Denoising iterations
denoising_iterations <- 3             # Number of times to run noise filtering

# Rest detection
rest_rolling_window_min <- 05                    # Minutes for rolling average calculation
rest_speed_threshold_mph <- 0.5                  # Rolling avg speed threshold
rest_elevation_change_threshold_ft_per_min <- 5  # Absolute elevation change threshold (up or down)

# Distance-based intervals
distance_interval_mi <- 0.05  # Distance bucket size (0.05 mile)

# Terrain classification
terrain_rolling_intervals <- 3    # Number of intervals for rolling average (5 * 0.05 = 0.25 mile)
terrain_climb_threshold_ft <- 10   # Net elevation gain threshold for "climbing"
terrain_descent_threshold_ft <- -10  # Net elevation gain threshold for "descending"

# Visualization colors (hex codes)
color_climbing <- "#FF8C00"        # Orange for climbing sections
color_flats <- "#4169E1"          # Blue for flats sections
color_descending <- "#195319"     # Green for descending sections
color_removed_points <- "#411d1d" # Light grey for removed/filtered points
color_active <- "#000000"         # Black for active segments
color_rest <- "#5a958b"           # Mid-grey for rest segments

# Minimum points threshold
min_points_for_analysis <- 100  # Skip activities with fewer points

# Display options
options(digits = 15)           # Show full precision for coordinates
options(pillar.sigfig = 10)    # Tibble display precision

## shared helper functions ----

# Extract activity ID from GPX filename
extract_activity_id <- function(filepath) {
  str_extract(basename(filepath), "(?<=activity_)\\d+")
}

## pipeline status ----

message("\n========================================")
message("  Garmin Data Analysis Pipeline")
message("========================================")
message(paste("Raw data directory:", raw_gpx_dir))
message(paste("Output directory:", clean_data_dir))
message(paste("\nNoise filtering thresholds:"))
message(paste("  Single metric (extreme):", one_noise_metric_filter_threshold, "SD"))
message(paste("  Multi-metric (2+):", two_noise_metric_filter_threshold, "SD"))
message(paste("\nDistance interval size:", distance_interval_mi, "miles"))
message("========================================\n")

## run scripts ----

source("data_pipeline/01_load_gpx_data.R")
source("data_pipeline/02_clean_noise_data.R")
source("data_pipeline/03_distance_intervals.R")
source("data_pipeline/04_visualize_clean_data.R")
source("data_pipeline/05_comparative_analysis.R")
source("data_pipeline/06_time_prediction_models.R")
source("data_pipeline/07_predict_time.R")




