## Comparative Analysis of Climb Segments
## Creates visualizations showing relationships between climb characteristics

message("\n=== Stage 5: Comparative Analysis ===\n")

## Load data ----

message("Loading terrain sections data...")
terrain_sections <- read.csv(file.path(clean_data_dir, "terrain_sections.csv"))
distance_intervals <- read.csv(file.path(clean_data_dir, "distance_intervals.csv"))

message(paste("  Loaded", format(nrow(terrain_sections), big.mark = ","), "sections"))

## Prepare climb data ----

message("\nPreparing climb segment data...")

# Filter for climbing sections and add derived metrics
climb_data <- terrain_sections %>%
  filter(
    terrain_type == "climbing",
    net_elevation_change_ft > 0,  # Must have positive elevation gain
    section_distance_mi >= 0.15    # Minimum distance threshold
  ) %>%
  mutate(
    # Parse timestamps
    section_start_time = ymd_hms(section_start_time),
    section_start_time_local = ymd_hms(section_start_time_local),

    # Calculate climb pace (min/mile during active movement)
    climb_pace_min_mi = if_else(
      section_distance_mi > 0,
      active_time_min / section_distance_mi,
      NA_real_
    ),

    # Calculate rate of ascent (ft/hr) - using active time only
    rate_of_ascent_ft_hr = if_else(
      active_time_sec > 0,
      elevation_gain_ft / (active_time_sec / 3600),
      NA_real_
    ),

    # Time of day (hour)
    start_hour = hour(section_start_time_local),

    # Categorize by distance
    distance_category = case_when(
      section_distance_mi < 0.25 ~ "Short (<0.25 mi)",
      section_distance_mi < 0.5 ~ "Medium (0.25-0.5 mi)",
      TRUE ~ "Long (>0.5 mi)"
    ),

    # Categorize by grade
    grade_category = case_when(
      calculated_grade_percent < 5 ~ "Gentle (<5%)",
      calculated_grade_percent < 10 ~ "Moderate (5-10%)",
      calculated_grade_percent < 15 ~ "Steep (10-15%)",
      TRUE ~ "Very Steep (>15%)"
    )
  ) %>%
  # Remove any rows with missing critical data
  filter(
    !is.na(rate_of_ascent_ft_hr),
    !is.na(climb_pace_min_mi),
    !is.na(calculated_grade_percent),
    rate_of_ascent_ft_hr > 0,
    climb_pace_min_mi > 0
  )

message(paste("  Analyzing", nrow(climb_data), "climbing sections"))
message(paste("  From", length(unique(climb_data$activity_id)), "activities"))

## Prepare rest data ----

message("\nPreparing rest timing data...")

# Calculate elapsed time at start of each section and filter for sections with rest
rest_data <- terrain_sections %>%
  group_by(activity_id) %>%
  arrange(section_id) %>%
  mutate(
    # Calculate elapsed time at start of each section
    elapsed_time_at_start_min = cumsum(lag(total_elapsed_time_min, default = 0))
  ) %>%
  ungroup() %>%
  # Filter for sections with meaningful rest time
  filter(
    rest_time_min > 0,
    rest_time_min < 60  # Filter out unreasonably long rest periods (> 1 hour)
  )

message(paste("  Analyzing", nrow(rest_data), "sections with rest"))
message(paste("  From", length(unique(rest_data$activity_id)), "activities"))

## Prepare data for elevation plots ----

message("\nPreparing elevation data from intervals...")

# Prepare interval data with elapsed time and time of day
interval_elevation_data <- distance_intervals %>%
  group_by(activity_id) %>%
  arrange(distance_interval) %>%
  mutate(
    # Calculate elapsed time at start of each interval
    elapsed_time_at_start_min = cumsum(lag(total_elapsed_time_min, default = 0)),
    # Parse timestamps
    interval_start_time_local = ymd_hms(interval_start_time_local),
    # Extract hour of day
    start_hour = interval_start_hour_local,
    # Convert terrain type to factor with defined order
    terrain_type = factor(terrain_type, levels = c("climbing", "flats", "descending"))
  ) %>%
  ungroup() %>%
  # Remove any NA values
  filter(!is.na(start_elevation_ft), !is.na(elapsed_time_at_start_min), !is.na(start_hour))

message(paste("  Prepared", nrow(interval_elevation_data), "intervals across all terrain types"))

## Create plots ----

message("\nGenerating comparative analysis plots...")

# Define plot colors by terrain type
terrain_colors <- c(
  "climbing" = color_climbing,
  "flats" = color_flats,
  "descending" = color_descending
)

# Define plot color for climbing-specific plots
plot_color <- "#FF8C00"  # Orange for climbing
message(paste("Using plot color:", plot_color))

# Plot 1: Elevation vs Elapsed Time (Line plot by activity)
plot1_gg <- ggplot(interval_elevation_data, aes(x = elapsed_time_at_start_min, y = start_elevation_ft,
                                                  color = terrain_type, group = activity_id)) +
  geom_line(alpha = 0.4, linewidth = 0.6) +
  scale_color_manual(
    values = terrain_colors,
    name = "Terrain Type",
    labels = c("Climbing", "Flats", "Descending")
  ) +
  labs(
    title = "Elevation Profiles Over Activity Duration",
    x = "Elapsed Time (minutes)",
    y = "Elevation (feet)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11),
    legend.position = "bottom"
  )
plot1 <- ggplotly(plot1_gg, tooltip = c("x", "y", "color")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 60))

# Plot 2: Elevation vs Time of Day (Line plot by activity)
plot2_gg <- ggplot(interval_elevation_data, aes(x = start_hour, y = start_elevation_ft,
                                                  color = terrain_type, group = activity_id)) +
  geom_line(alpha = 0.4, linewidth = 0.6) +
  scale_color_manual(
    values = terrain_colors,
    name = "Terrain Type",
    labels = c("Climbing", "Flats", "Descending")
  ) +
  scale_x_continuous(breaks = seq(0, 23, 3)) +
  labs(
    title = "Elevation Profiles by Time of Day",
    x = "Hour of Day",
    y = "Elevation (feet)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11),
    legend.position = "bottom"
  )
plot2 <- ggplotly(plot2_gg, tooltip = c("x", "y", "color")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 60))

# Plot 3: Starting Elevation vs Ascent Rate
plot3_gg <- ggplot(climb_data, aes(x = start_elevation_ft, y = rate_of_ascent_ft_hr)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Starting Elevation vs Ascent Rate",
    x = "Starting Elevation (feet)",
    y = "Ascent Rate (ft/hr)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot3 <- ggplotly(plot3_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 4: Distance vs Ascent Rate
plot4_gg <- ggplot(climb_data, aes(x = start_elevation_ft, y = rate_of_ascent_ft_hr)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Starting Elevation vs Ascent Rate",
    x = "Starting Elevation (feet)",
    y = "Ascent Rate (ft/hr)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot4 <- ggplotly(plot4_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 5: Average Grade vs Ascent Rate
plot5_gg <- ggplot(climb_data, aes(x = calculated_grade_percent, y = rate_of_ascent_ft_hr)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Grade vs Ascent Rate",
    x = "Average Grade (%)",
    y = "Ascent Rate (ft/hr)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot5 <- ggplotly(plot5_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 6: Distance vs Ascent Rate
plot6_gg <- ggplot(climb_data, aes(x = section_distance_mi, y = rate_of_ascent_ft_hr)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Distance vs Ascent Rate",
    x = "Climb Distance (miles)",
    y = "Ascent Rate (ft/hr)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot4 <- ggplotly(plot4_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 5: Elevation Gain vs Time
plot5_gg <- ggplot(climb_data, aes(x = elevation_gain_ft, y = active_time_min)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Elevation Gain vs Time",
    x = "Elevation Gain (feet)",
    y = "Active Time (minutes)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot5 <- ggplotly(plot5_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 6: Grade vs Ascent Rate
plot6_gg <- ggplot(climb_data, aes(x = calculated_grade_percent, y = rate_of_ascent_ft_hr)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Grade vs Ascent Rate",
    x = "Average Grade (%)",
    y = "Ascent Rate (ft/hr)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot6 <- ggplotly(plot6_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 7: Distance vs Elevation Gain (Climb Difficulty)
plot7_gg <- ggplot(climb_data, aes(x = section_distance_mi, y = elevation_gain_ft)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Climb Difficulty (Distance vs Elevation)",
    x = "Distance (miles)",
    y = "Elevation Gain (feet)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot7 <- ggplotly(plot7_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 8: Time of Day vs Average Speed
plot8_gg <- ggplot(climb_data, aes(x = start_hour, y = rate_of_ascent_ft_hr)) +
  geom_point(alpha = 0.6, color = plot_color, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Time of Day vs Ascent Rate",
    x = "Hour of Day",
    y = "Ascent Rate (ft/hr)"
  ) +
  scale_x_continuous(breaks = seq(0, 23, 3)) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot8 <- ggplotly(plot8_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 11: Rest Time vs Elapsed Time (Fatigue Analysis)
plot11_gg <- ggplot(rest_data, aes(x = elapsed_time_at_start_min, y = rest_time_min)) +
  geom_point(alpha = 0.6, color = color_rest, size = 2) +
  geom_smooth(method = "lm", se = TRUE, color = "#333333", fill = "grey80", alpha = 0.3, linewidth = 1) +
  labs(
    title = "Rest Time vs Elapsed Time (Fatigue Pattern)",
    x = "Elapsed Time at Start of Rest (minutes)",
    y = "Rest Duration (minutes)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot11 <- ggplotly(plot11_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

# Plot 12: Cumulative Rest Time Over Activity Duration
# Prepare cumulative rest data for each activity
cumulative_rest_data <- terrain_sections %>%
  group_by(activity_id) %>%
  arrange(section_id) %>%
  mutate(
    # Calculate elapsed time at start of each section
    elapsed_time_at_start_min = cumsum(lag(total_elapsed_time_min, default = 0)),
    # Calculate cumulative rest time
    cumulative_rest_time_min = cumsum(rest_time_min)
  ) %>%
  ungroup() %>%
  # Only keep activities with meaningful rest (at least 5 min total)
  group_by(activity_id) %>%
  filter(max(cumulative_rest_time_min) >= 5) %>%
  ungroup()

plot12_gg <- ggplot(cumulative_rest_data, aes(x = elapsed_time_at_start_min, y = cumulative_rest_time_min, group = activity_id)) +
  geom_line(alpha = 0.3, color = color_rest, linewidth = 0.8) +
  labs(
    title = "Cumulative Rest Time Over Activity Duration",
    x = "Elapsed Time (minutes)",
    y = "Cumulative Rest Time (minutes)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )
plot12 <- ggplotly(plot12_gg, tooltip = c("x", "y")) %>%
  layout(height = 350, margin = list(l = 60, r = 20, t = 50, b = 50))

## Create summary statistics ----

message("\nCalculating summary statistics...")

summary_stats <- climb_data %>%
  summarise(
    total_climbs = n(),
    total_activities = n_distinct(activity_id),
    total_climb_distance_mi = sum(section_distance_mi, na.rm = TRUE),
    total_elevation_gain_ft = sum(elevation_gain_ft, na.rm = TRUE),
    avg_climb_distance_mi = mean(section_distance_mi, na.rm = TRUE),
    avg_elevation_gain_ft = mean(elevation_gain_ft, na.rm = TRUE),
    avg_grade_percent = mean(calculated_grade_percent, na.rm = TRUE),
    avg_speed_mph = mean(avg_speed_mph, na.rm = TRUE),
    avg_pace_min_mi = mean(climb_pace_min_mi, na.rm = TRUE),
    avg_ascent_rate_ft_hr = mean(rate_of_ascent_ft_hr, na.rm = TRUE)
  )

## Build HTML report ----

message("\nBuilding HTML report...")

# Create HTML page
html_content <- tags$html(
  tags$head(
    tags$title("Comparative Climb Analysis"),
    tags$meta(charset = "utf-8"),
    tags$meta(name = "viewport", content = "width=device-width, initial-scale=1"),
    # Bootstrap CSS
    tags$link(
      rel = "stylesheet",
      href = "https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css"
    ),
    tags$style(HTML("
      body {
        padding: 20px;
        background-color: #f5f5f5;
      }
      .container {
        max-width: 1400px;
        margin: 0 auto;
        background-color: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      h1 {
        margin-bottom: 10px;
        color: #333;
      }
      .lead {
        color: #666;
        margin-bottom: 30px;
      }
      .stat-card {
        background: #f8f9fa;
        border: 1px solid #ddd;
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 20px;
        text-align: center;
      }
      .stat-label {
        font-size: 11px;
        color: #666;
        font-weight: 500;
        text-transform: uppercase;
        margin-bottom: 5px;
      }
      .stat-value {
        font-size: 20px;
        font-weight: bold;
        color: #333;
      }
      .plot-container {
        margin-bottom: 20px;
        padding: 15px;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
      }
    "))
  ),
  tags$body(
    tags$div(
      class = "container",

      # Header
      tags$h1("Comparative Climb Analysis"),
      tags$p(
        class = "lead",
        "Trends and Relationships in Climbing Performance"
      ),

      # Summary statistics
      tags$div(
        class = "row",
        style = "margin-bottom: 30px;",

        tags$div(
          class = "col-md-2",
          tags$div(
            class = "stat-card",
            tags$div(class = "stat-label", "Total Climbs"),
            tags$div(class = "stat-value", format(summary_stats$total_climbs, big.mark = ","))
          )
        ),

        tags$div(
          class = "col-md-2",
          tags$div(
            class = "stat-card",
            tags$div(class = "stat-label", "Activities"),
            tags$div(class = "stat-value", summary_stats$total_activities)
          )
        ),

        tags$div(
          class = "col-md-2",
          tags$div(
            class = "stat-card",
            tags$div(class = "stat-label", "Total Distance"),
            tags$div(class = "stat-value", sprintf("%.1f mi", summary_stats$total_climb_distance_mi))
          )
        ),

        tags$div(
          class = "col-md-2",
          tags$div(
            class = "stat-card",
            tags$div(class = "stat-label", "Total Gain"),
            tags$div(class = "stat-value", sprintf("%.0f ft", summary_stats$total_elevation_gain_ft))
          )
        ),

        tags$div(
          class = "col-md-2",
          tags$div(
            class = "stat-card",
            tags$div(class = "stat-label", "Avg Grade"),
            tags$div(class = "stat-value", sprintf("%.1f%%", summary_stats$avg_grade_percent))
          )
        ),

        tags$div(
          class = "col-md-2",
          tags$div(
            class = "stat-card",
            tags$div(class = "stat-label", "Avg Pace"),
            tags$div(class = "stat-value", sprintf("%.1f min/mi", summary_stats$avg_pace_min_mi))
          )
        )
      ),

      # Plots in 2-column grid
      tags$div(
        class = "row",

        # Row 1
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot1)),
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot2)),

        # Row 2
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot3)),
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot4)),

        # Row 3
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot5)),
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot6)),

        # Row 4
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot7)),
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot8)),

        # Row 5
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot9)),
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot10)),

        # Row 6 - Rest Analysis
        tags$div(
          class = "col-md-12",
          style = "margin-top: 30px;",
          tags$h4("Rest Pattern Analysis", style = "margin-bottom: 20px;")
        ),
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot11)),
        tags$div(class = "col-md-6", tags$div(class = "plot-container", plot12))
      )
    )
  )
)

## Save HTML ----

output_file <- file.path(validation_dir, "comparative_analysis.html")
message(paste("\nSaving HTML report to:", output_file))

# Save the HTML file
save_html(html_content, file = output_file)

message(paste("✓ Report saved:", output_file))

## Print summary ----

message("\n=== Comparative Analysis Summary ===")
message(paste("Total climbing sections analyzed:", summary_stats$total_climbs))
message(paste("Activities:", summary_stats$total_activities))
message(paste("Total climbing distance:", sprintf("%.2f mi", summary_stats$total_climb_distance_mi)))
message(paste("Total elevation gain:", sprintf("%.0f ft", summary_stats$total_elevation_gain_ft)))
message(paste("\nAverage climb metrics:"))
message(paste("  Distance:", sprintf("%.3f mi", summary_stats$avg_climb_distance_mi)))
message(paste("  Elevation gain:", sprintf("%.0f ft", summary_stats$avg_elevation_gain_ft)))
message(paste("  Grade:", sprintf("%.1f%%", summary_stats$avg_grade_percent)))
message(paste("  Speed:", sprintf("%.2f mph", summary_stats$avg_speed_mph)))
message(paste("  Pace:", sprintf("%.1f min/mile", summary_stats$avg_pace_min_mi)))
message(paste("  Ascent rate:", sprintf("%.0f ft/hr", summary_stats$avg_ascent_rate_ft_hr)))

message("\n=== Stage 5 Complete ===")
