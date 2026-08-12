## change point analysis

## libraries ----
library(zoo)
library(dplyr)
library(ggplot2)
library(lubridate)
library(tidyr)

## load data ----

long_segments <- read.csv("scratch/clean_data/long_segments_data.csv")
activity_metadata <- read.csv("scratch/clean_data/activity_metadata.csv")


## climb analysis ----

interval_data <- long_segments %>%
  group_by(activity_id) %>%
  mutate(
    # Convert end_time to datetime if needed
    end_time = ymd_hms(end_time),
    # Create 5-minute intervals based on when segments end
    time_interval = floor_date(end_time, unit = "5 minutes")
  ) %>%
  ungroup() %>%
  # Aggregate metrics by activity and time interval
  group_by(activity_id, time_interval) %>%
  summarise(
    # Time metrics
    total_time_sec = sum(time_delta_sec, na.rm = TRUE),
    start_time = min(start_time),
    end_time = max(end_time),
    min_elapsed_time = min(elapsed_time),

    # Distance metrics (metric)
    total_distance_m = sum(distance_3d_m, na.rm = TRUE),
    total_horizontal_distance_m = sum(horizontal_distance_m, na.rm = TRUE),

    # Distance metrics (imperial)
    total_distance_ft = sum(distance_3d_ft, na.rm = TRUE),
    total_distance_mi = sum(distance_3d_mi, na.rm = TRUE),
    total_horizontal_distance_ft = sum(horizontal_distance_ft, na.rm = TRUE),
    total_horizontal_distance_mi = sum(horizontal_distance_mi, na.rm = TRUE),

    # Elevation metrics (metric)
    total_elevation_gain_m = sum(elevation_delta_m[elevation_delta_m > 0], na.rm = TRUE),
    total_elevation_loss_m = abs(sum(elevation_delta_m[elevation_delta_m < 0], na.rm = TRUE)),
    net_elevation_change_m = sum(elevation_delta_m, na.rm = TRUE),

    # Elevation metrics (imperial)
    total_elevation_gain_ft = sum(elevation_delta_ft[elevation_delta_ft > 0], na.rm = TRUE),
    total_elevation_loss_ft = abs(sum(elevation_delta_ft[elevation_delta_ft < 0], na.rm = TRUE)),
    net_elevation_change_ft = sum(elevation_delta_ft, na.rm = TRUE),

    # Rate metrics
    elevation_gain_rate_m_per_min = total_elevation_gain_m / (total_time_sec / 60),
    elevation_gain_rate_ft_per_min = total_elevation_gain_ft / (total_time_sec / 60),

    # Weighted averages (weighted by segment duration)
    avg_speed_ms = weighted.mean(speed_ms, w = time_delta_sec, na.rm = TRUE),
    avg_speed_kmh = weighted.mean(speed_kmh, w = time_delta_sec, na.rm = TRUE),
    avg_speed_mph = weighted.mean(speed_mph, w = time_delta_sec, na.rm = TRUE),
    avg_grade_percent = weighted.mean(grade_percent, w = time_delta_sec, na.rm = TRUE),

    # Calculate pace from total distance and time (more accurate than averaging pace values)
    avg_pace_min_km = if_else(total_distance_m > 0,
                              (total_time_sec / 60) / (total_distance_m / 1000),
                              NA_real_),
    avg_pace_min_mi = if_else(total_distance_mi > 0,
                              (total_time_sec / 60) / total_distance_mi,
                              NA_real_),

    # Other Metrics
    max_elevation_m = max(start_elevation_m, na.rm = TRUE),
    max_elevation_ft = max(start_elevation_ft, na.rm = TRUE),

    # Count of segments in this interval
    n_segments = n(),

    .groups = "drop"
  )

# Preview the interval data
View(interval_data)


## Visualize Trends in Climbing Data ----

active_climb_intervals <- interval_data %>%
  filter(net_elevation_change_ft > 15) %>%
  filter(avg_grade_percent > 0) %>%
  filter(avg_grade_percent < 200)

active_climb_intervals %>%
  filter(max_elevation_ft >= 9100) %>%  # ~2800 meters
  ggplot(aes(x = max_elevation_ft, y = avg_speed_mph, color = as.character(activity_id))) +
  geom_point(alpha = 0.5) +
  geom_smooth(color = "black", method = "lm") +
  labs(
    title = "Speed vs. Elevation While Climbing",
    subtitle = "Above 9,000 ft Avg Speed Trends Down with Elevation",
    x = "Max Elevation (feet)",
    y = "Avg Speed (mph)"
  ) +
  theme_minimal() +
  theme(legend.position = "none")

active_climb_intervals %>%
  # filter(max_elevation_ft >= 9100) %>%  # ~2800 meters
  ggplot(aes(x = avg_grade_percent, y = avg_speed_mph, color = as.character(activity_id))) +
  geom_point(alpha = 0.3) +
  geom_smooth(
    color = "black", 
    method = "glm", 
    method.args = list(family = gaussian(link = "log"))
  ) +
  labs(
    title = "Speed vs. Grade While Climbing",
    subtitle = "Average Speed Decreases Exponentially With Percent Grade",
    x = "% Grade (Feet Ascended Per 100 Horizontal Feet)",
    y = "Avg Speed (mph)"
  ) +
  theme_minimal() +
  theme(legend.position = "none")



## Change Point Analysis ----

#' In theorty rolling averages should work better now that each interval 
#' represents a consistent ammount of time

inflection_class <- interval_data %>%
  group_by(activity_id) %>%
  mutate(
    # Rolling averages over 30 minutes (6 intervals of 5 min each)
    rolling_elevation_gain = rollmean(net_elevation_change_ft, k = 6, fill = NA),
    rolling_avg_speed = rollmean(avg_speed_mph, k = 6, fill = NA),
    rolling_pct_grade = rollmean(avg_grade_percent, k = 6, fill = NA),

    # Classify section type (rest takes priority)
    net_direction = case_when(
      rolling_avg_speed < 1 & avg_speed_mph < 0.2 ~ "rest",
      rolling_elevation_gain >= 20 ~ "climb",
      rolling_elevation_gain <= -20 ~ "descent",
      TRUE ~ "flat"
    ),
    # Detect when direction changes to start a new section
    direction_change = net_direction != lag(net_direction, default = first(net_direction)),
    # Create section number (cumsum of changes, +1 to start at 1)
    section_number = cumsum(direction_change) + 1,
    # Create formatted section_id (activity_id_001, activity_id_002, etc.)
    section_id = paste0(activity_id, "_", sprintf("%03d", section_number)),
    # Section type is the net_direction
    section_type = net_direction
  ) %>%
  ungroup() 

# Detailed metrics plot for single activity
inflection_class %>%
  filter(activity_id == 23732307020) %>%
  group_by(activity_id) %>%
  mutate(
    activity_start = min(time_interval, na.rm = TRUE),
    elapsed_min = as.numeric(difftime(time_interval, activity_start, units = "mins"))
  ) %>%
  ungroup() %>%
  select(elapsed_min, max_elevation_ft, rolling_avg_speed, rolling_elevation_gain, rolling_pct_grade, section_type) %>%
  pivot_longer(
    cols = c(max_elevation_ft, rolling_avg_speed, rolling_elevation_gain, rolling_pct_grade),
    names_to = "metric",
    values_to = "value"
  ) %>%
  mutate(
    metric = case_when(
      metric == "max_elevation_ft" ~ "Elevation (feet)",
      metric == "rolling_avg_speed" ~ "Rolling Avg Speed (mph)",
      metric == "rolling_elevation_gain" ~ "Rolling Elevation Change (feet)",
      metric == "rolling_pct_grade" ~ "Average Grade (%)"
    ),
    metric = factor(metric, levels = c("Elevation (feet)", "Rolling Avg Speed (mph)",
                                       "Rolling Elevation Change (feet)", "Average Grade (%)"))
  ) %>%
  ggplot(aes(x = elapsed_min, y = value, color = section_type)) +
  # geom_line(linewidth = 1) +
  geom_point(size = 1.5, alpha = 0.6) +
  scale_color_manual(values = c("climb" = "#d73027", "descent" = "#4575b4",
                                "flat" = "#fee090", "rest" = "#969696")) +
  facet_wrap(~metric, ncol = 1, scales = "free_y") +
  labs(
    title = "Activity Metrics Over Time - Activity 23732307020",
    subtitle = "Elevation, speed, elevation change, and grade colored by section type",
    x = "Elapsed Time (minutes)",
    y = NULL,
    color = "Section Type"
  ) +
  theme_minimal() +
  theme(
    legend.position = "bottom",
    strip.placement = "outside",
    strip.text = element_text(face = "bold", size = 10)
  )

# inflection_class %>%
#   ggplot(aes(x = min_elapsed_time, y = rolling_elevation_gain, color = net_direction)) +
#   geom_hline(yintercept = 0) +
#   geom_point(size = 1, alpha = 0.4) +
#   facet_wrap(~as.character(activity_id)) +
#   theme_minimal() +
#   theme(legend.position = "none")

inflection_class %>%
  # filter(activity_id == 23732307020) %>%
  group_by(activity_id) %>%
  mutate(
    # Calculate elapsed time in minutes from start of activity
    activity_start = min(time_interval, na.rm = TRUE),
    elapsed_min = as.numeric(difftime(time_interval, activity_start, units = "mins"))
  ) %>%
  ungroup() %>%
  ggplot(aes(x = elapsed_min, y = max_elevation_ft, color = section_type, group = activity_id)) +
  geom_line(linewidth = 1.2, alpha = 0.8) +
  geom_point(size = 1.5, alpha = 0.6) +
  scale_color_manual(values = c("climb" = "#d73027", "descent" = "#4575b4",
                                "flat" = "#fee090", "rest" = "#969696")) +
  facet_wrap(~activity_id, ncol = 4) +
  labs(
    title = "Elevation Profiles by Activity with Section Classification",
    subtitle = "Each section colored by type: climb, descent, flat, or rest",
    x = "Elapsed Time (minutes)",
    y = "Elevation (feet)",
    color = "Section Type"
  ) +
  theme_minimal() +
  theme(
    legend.position = "none",
    strip.text = element_text(face = "bold")
  )


## Section-level summary statistics ----

section_stats <- inflection_class %>%
  group_by(activity_id, section_id, section_type) %>%
  summarise(
    # Time metrics
    section_duration_sec = sum(total_time_sec, na.rm = TRUE),
    section_duration_min = section_duration_sec / 60,
    start_time = min(time_interval, na.rm = TRUE),
    end_time = max(time_interval, na.rm = TRUE),

    # Distance metrics
    total_distance_ft = sum(total_distance_ft, na.rm = TRUE),
    total_distance_mi = sum(total_distance_mi, na.rm = TRUE),
    total_horizontal_distance_mi = sum(total_horizontal_distance_mi, na.rm = TRUE),

    # Elevation metrics
    total_elevation_gain_ft = sum(total_elevation_gain_ft, na.rm = TRUE),
    total_elevation_loss_ft = sum(total_elevation_loss_ft, na.rm = TRUE),
    net_elevation_change_ft = sum(net_elevation_change_ft, na.rm = TRUE),
    start_elevation_ft = first(max_elevation_ft),
    end_elevation_ft = last(max_elevation_ft),
    max_elevation_ft = max(max_elevation_ft, na.rm = TRUE),
    min_elevation_ft = min(max_elevation_ft, na.rm = TRUE),

    # Averages (weighted by time)
    avg_grade_percent = weighted.mean(avg_grade_percent, w = total_time_sec, na.rm = TRUE),
    avg_speed_mph = weighted.mean(avg_speed_mph, w = total_time_sec, na.rm = TRUE),
    avg_pace_min_mi = weighted.mean(avg_pace_min_mi, w = total_time_sec, na.rm = TRUE),

    # Count
    n_intervals = n(),

    .groups = "drop"
  ) %>%
  mutate(
    # Calculate rates
    elevation_gain_rate_ft_per_min = total_elevation_gain_ft / section_duration_min,
    # Overall grade for the section
    overall_grade_percent = if_else(total_horizontal_distance_mi > 0,
                                    (net_elevation_change_ft / (total_horizontal_distance_mi * 5280)) * 100,
                                    NA_real_)
  ) %>%
  filter(!(section_type == "climb" & avg_grade_percent < 0)) %>%
  filter(!(section_type == "descend" & avg_grade_percent > 0)) %>%
  filter(section_duration_min > 9)

# Preview section stats
View(section_stats)


## Section visualization plots ----

# Plot 1: Distribution of section durations by type
section_stats %>%
  ggplot(aes(x = section_type, y = section_duration_min, fill = section_type)) +
  geom_boxplot(alpha = 0.7) +
  geom_jitter(width = 0.2, alpha = 0.3, size = 1) +
  scale_fill_manual(values = c("climb" = "#d73027", "descent" = "#4575b4", "flat" = "#fee090", "rest" = "#969696")) +
  labs(
    title = "Section Duration by Type",
    x = "Section Type",
    y = "Duration (minutes)"
  ) +
  theme_minimal() +
  theme(legend.position = "none")

# Plot 2: Elevation gain vs distance for climbing sections
section_stats %>%
  filter(section_type == "climb", total_elevation_gain_ft > 0) %>%
  ggplot(aes(x = total_distance_mi, y = total_elevation_gain_ft)) +
  geom_point(aes(color = avg_speed_mph), size = 3, alpha = 0.7) +
  geom_smooth(method = "lm", se = TRUE, color = "black", linetype = "dashed") +
  # scale_color_viridis_c(option = "plasma") +
  labs(
    title = "Climbing Sections: Elevation Gain vs Distance",
    subtitle = "Colored by average speed",
    x = "Distance (miles)",
    y = "Elevation Gain (feet)",
    color = "Avg Speed\n(mph)"
  ) +
  theme_minimal()

# Plot 3: Average speed comparison across section types
section_stats %>%
  filter(!is.na(avg_speed_mph), avg_speed_mph < 20) %>%  # Filter outliers
  ggplot(aes(x = section_type, y = avg_speed_mph, fill = section_type)) +
  geom_violin(alpha = 0.5) +
  geom_boxplot(width = 0.2, alpha = 0.8) +
  scale_fill_manual(values = c("climb" = "#d73027", "descent" = "#4575b4", "flat" = "#fee090", "rest" = "#969696")) +
  labs(
    title = "Speed Distribution by Section Type",
    x = "Section Type",
    y = "Average Speed (mph)"
  ) +
  theme_minimal() +
  theme(legend.position = "none")

# Plot 4: Grade vs speed for all sections
section_stats %>%
  filter(!is.na(avg_speed_mph), avg_speed_mph < 20,
         abs(avg_grade_percent) < 50) %>%  # Filter outliers
  ggplot(aes(x = avg_grade_percent, y = avg_speed_mph, color = section_type)) +
  geom_point(alpha = 0.6, size = 2) +
  geom_smooth(method = "lm", se = FALSE, linewidth = 1) +
  scale_color_manual(values = c("climb" = "#d73027", "descent" = "#4575b4", "flat" = "#fee090", "rest" = "#969696")) +
  labs(
    title = "Speed vs Grade Across All Sections",
    subtitle = "Steeper climbs lead to slower speeds",
    x = "Average Grade (%)",
    y = "Average Speed (mph)",
    color = "Section Type"
  ) +
  theme_minimal()

# Plot 5: Section composition per activity
section_stats %>%
  group_by(activity_id, section_type) %>%
  summarise(
    total_time_min = sum(section_duration_min),
    total_distance_mi = sum(total_distance_mi),
    .groups = "drop"
  ) %>%
  ggplot(aes(x = as.character(activity_id), y = total_time_min, fill = section_type)) +
  geom_col(position = "stack") +
  scale_fill_manual(values = c("climb" = "#d73027", "descent" = "#4575b4", "flat" = "#fee090", "rest" = "#969696")) +
  labs(
    title = "Activity Composition by Section Type",
    subtitle = "Time spent climbing, descending, on flat terrain, and resting",
    x = "Activity ID",
    y = "Time (minutes)",
    fill = "Section Type"
  ) +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1))

# Plot 6: All climb segments elevation gain over time
inflection_class %>%
  filter(section_type == "climb") %>%
  group_by(section_id) %>%
  mutate(
    # Normalize time to start at 0 for each segment
    section_start_time = min(time_interval, na.rm = TRUE),
    segment_elapsed_min = as.numeric(difftime(time_interval, section_start_time, units = "mins")),
    # Normalize elevation to start at 0 for each segment
    section_start_elevation = first(max_elevation_ft),
    elevation_gain_ft = max_elevation_ft - section_start_elevation
  ) %>%
  ungroup() %>%
  ggplot(aes(x = segment_elapsed_min, y = elevation_gain_ft, group = section_id, color = activity_id)) +
  geom_line(linewidth = 0.8, alpha = 0.6) +
  geom_point(size = 1.2, alpha = 0.4) +
  scale_color_viridis_c(option = "turbo") +
  labs(
    title = "Elevation Gain Patterns Across All Climb Segments",
    subtitle = "Each line represents one continuous climb, normalized to start at time 0 and elevation 0",
    x = "Time Since Climb Start (minutes)",
    y = "Cumulative Elevation Gain (feet)",
    color = "Activity ID"
  ) +
  theme_minimal() +
  theme(legend.position = "right")


## Climb Duration Model ----

#' model:
#' - the target is the total time of the section
#' - the independent vars are:
#'   - min elevation
#'   - max elevation
#'   - total elevation gain
#'   - total distance
#' - the model should be a linear model under the hood
#' - some terms may need to be exponential to predict the outcome correctly

# Prepare climb data for modeling
climb_data <- section_stats %>%
  filter(section_type == "climb", section_duration_min > 0) %>%
  # Join with activity metadata to get activity_type, start_time_utc, and timezone
  left_join(activity_metadata %>% select(activity_id, activity_type, start_time_utc, timezone), by = "activity_id") %>%
  # Group by activity to calculate cumulative metrics
  group_by(activity_id) %>%
  arrange(start_time) %>%  # start_time from section_stats (no suffix since no conflict)
  mutate(
    # Cumulative metrics prior to this section (using lag to exclude current section)
    cumulative_elevation_prior_ft = cumsum(lag(total_elevation_gain_ft, default = 0)),
    cumulative_distance_prior_mi = cumsum(lag(total_distance_mi, default = 0))
  ) %>%
  ungroup() %>%
  mutate(
    # Parse timestamps
    section_start_time = ymd_hms(start_time),      # From section_stats
    activity_start_time = ymd_hms(start_time_utc), # From activity_metadata

    # Calculate elapsed time prior to section start (in minutes)
    elapsed_time_prior_min = as.numeric(difftime(section_start_time, activity_start_time, units = "mins")),

    # Log transform elapsed time to capture non-linear fatigue effects
    # Add 1 to avoid log(0) for sections starting immediately
    log_elapsed_time = log(elapsed_time_prior_min + 1),

    # Calculate elapsed time as fraction of total activity duration (0-1)
    # This normalizes for different activity lengths
    elapsed_time_fraction = elapsed_time_prior_min / (elapsed_time_prior_min + section_duration_min),

    # Convert section start time to local time and extract hour of day
    section_start_local = if_else(
      !is.na(timezone),
      with_tz(section_start_time, timezone),
      as.POSIXct(NA)
    ),
    start_hour_local = if_else(
      !is.na(section_start_local),
      hour(section_start_local),
      NA_integer_
    ),

    elevation_range_ft = max_elevation_ft - min_elevation_ft,
    # Log transform distance to handle non-linear relationship
    log_distance = log(total_distance_mi + 0.01),  # Add small constant to avoid log(0)
    # Add interaction term
    gain_distance_interaction = total_elevation_gain_ft * total_distance_mi,
    # Convert activity_type to factor for modeling
    activity_type = as.factor(activity_type)
  )

# Fit linear model with various predictors including activity type and fatigue
climb_duration_model <- lm(
  section_duration_min ~
    min_elevation_ft +
    max_elevation_ft +
    total_elevation_gain_ft +
    total_distance_mi +
    log_distance +
    gain_distance_interaction +
    activity_type +
    elapsed_time_prior_min +
    log_elapsed_time +
    avg_grade_percent +
    cumulative_elevation_prior_ft +
    cumulative_distance_prior_mi +
    start_hour_local,
  data = climb_data
)

# Model summary
summary(climb_duration_model)

# Check model diagnostics
par(mfrow = c(2, 2))
plot(climb_duration_model)
par(mfrow = c(1, 1))

# Add predictions to the data
climb_data <- climb_data %>%
  mutate(
    predicted_duration_min = predict(climb_duration_model, newdata = .),
    residual = section_duration_min - predicted_duration_min,
    residual_pct = (residual / section_duration_min) * 100
  )

# Actual vs Predicted plot
climb_data %>%
  ggplot(aes(x = section_duration_min, y = predicted_duration_min)) +
  geom_point(aes(color = total_elevation_gain_ft), size = 3, alpha = 0.7) +
  geom_abline(intercept = 0, slope = 1, linetype = "dashed", color = "red", linewidth = 1) +
  scale_color_viridis_c(option = "plasma") +
  labs(
    title = "Climb Duration Model: Actual vs Predicted",
    subtitle = paste0("R² = ", round(summary(climb_duration_model)$r.squared, 3),
                     " | RMSE = ", round(sqrt(mean(climb_data$residual^2)), 2), " min"),
    x = "Actual Duration (minutes)",
    y = "Predicted Duration (minutes)",
    color = "Elevation\nGain (ft)"
  ) +
  theme_minimal()

# Residuals plot
climb_data %>%
  ggplot(aes(x = predicted_duration_min, y = residual)) +
  geom_hline(yintercept = 0, linetype = "dashed", color = "red") +
  geom_point(aes(color = activity_id), size = 3, alpha = 0.7) +
  scale_color_viridis_c(option = "turbo") +
  labs(
    title = "Model Residuals",
    subtitle = "Checking for systematic prediction errors",
    x = "Predicted Duration (minutes)",
    y = "Residual (minutes)",
    color = "Activity ID"
  ) +
  theme_minimal()

# Feature importance (absolute t-values)
coef_summary <- summary(climb_duration_model)$coefficients %>%
  as.data.frame() %>%
  tibble::rownames_to_column("term") %>%
  filter(term != "(Intercept)") %>%
  mutate(
    abs_t_value = abs(`t value`),
    significant = `Pr(>|t|)` < 0.05
  ) %>%
  arrange(desc(abs_t_value))

coef_summary %>%
  ggplot(aes(x = reorder(term, abs_t_value), y = abs_t_value, fill = significant)) +
  geom_col() +
  coord_flip() +
  scale_fill_manual(values = c("FALSE" = "gray70", "TRUE" = "#d73027"),
                    labels = c("Not Significant (p ≥ 0.05)", "Significant (p < 0.05)")) +
  labs(
    title = "Feature Importance for Climb Duration Model",
    subtitle = "Based on absolute t-values",
    x = "Predictor Variable",
    y = "Absolute t-value",
    fill = "Significance"
  ) +
  theme_minimal()

# Print model performance metrics
cat("\n=== Climb Duration Model Performance ===\n")
cat("R-squared:", round(summary(climb_duration_model)$r.squared, 4), "\n")
cat("Adjusted R-squared:", round(summary(climb_duration_model)$adj.r.squared, 4), "\n")
cat("RMSE:", round(sqrt(mean(climb_data$residual^2)), 2), "minutes\n")
cat("Mean Absolute Error:", round(mean(abs(climb_data$residual)), 2), "minutes\n")
cat("Mean Absolute % Error:", round(mean(abs(climb_data$residual_pct)), 2), "%\n")
