## Time Prediction Models
## Creates linear models to predict section completion time for climbing, flats, and descending

message("\n=== Stage 6: Time Prediction Models ===\n")

## Load data ----

message("Loading terrain sections data...")
terrain_sections <- read.csv(file.path(clean_data_dir, "terrain_sections.csv"))
activity_metadata <- read.csv(file.path(clean_data_dir, "activity_metadata.csv"))

message(paste("  Loaded", format(nrow(terrain_sections), big.mark = ","), "sections"))

# Join with activity metadata to get activity type
terrain_sections <- terrain_sections %>%
  left_join(
    activity_metadata %>% select(activity_id, activity_type),
    by = "activity_id"
  )

## Prepare modeling data ----

message("\nPreparing modeling datasets...")

# Add derived features and filter for quality
modeling_data <- terrain_sections %>%
  mutate(
    # Parse timestamps
    section_start_time_local = ymd_hms(section_start_time_local),
    start_hour = hour(section_start_time_local),

    # Calculate rate of ascent for climbs
    rate_of_ascent_ft_hr = if_else(
      active_time_sec > 0,
      elevation_gain_ft / (active_time_sec / 3600),
      NA_real_
    ),

    # Log of absolute grade (adding 1 to handle zeros)
    log_abs_grade = log1p(abs(calculated_grade_percent)),

    # Convert activity type to factor
    activity_type = as.factor(if_else(is.na(activity_type) | activity_type == "",
                                      "Unknown", activity_type))
  ) %>%
  # Calculate cumulative metrics within each activity
  group_by(activity_id) %>%
  arrange(section_id) %>%
  mutate(
    # Cumulative time elapsed before this section starts
    cumulative_time_min = cumsum(lag(total_elapsed_time_min, default = 0)),

    # Cumulative elevation gained before this section starts
    cumulative_elevation_gain_ft = cumsum(lag(elevation_gain_ft, default = 0))
  ) %>%
  ungroup() %>%
  # Filter for quality data
  filter(
    section_distance_mi > 0,
    active_time_min > 0,
    !is.na(calculated_grade_percent)
  )

# Split by terrain type
climb_data <- modeling_data %>%
  filter(
    terrain_type == "climbing",
    net_elevation_change_ft > 0,
    section_distance_mi >= 0.15
  )

flats_data <- modeling_data %>%
  filter(terrain_type == "flats")

descent_data <- modeling_data %>%
  filter(
    terrain_type == "descending",
    section_distance_mi >= 0.15
  )

message(paste("  Climbing sections:", nrow(climb_data)))
message(paste("  Flats sections:", nrow(flats_data)))
message(paste("  Descending sections:", nrow(descent_data)))

## Build models ----

message("\nBuilding time prediction models...")

# Model 1: Climbing time prediction
# Predictors: distance, elevation gain, grade, log(grade), starting elevation,
#             time of day, cumulative time, cumulative elevation gain, activity type
climb_model <- lm(
  active_time_min ~ section_distance_mi + elevation_gain_ft +
    calculated_grade_percent + log_abs_grade + start_elevation_ft +
    start_hour + cumulative_time_min + cumulative_elevation_gain_ft +
    activity_type,
  data = climb_data
)

message("  ✓ Climbing model built")

# Model 2: Flats time prediction
# Predictors: distance, net elevation change, grade, log(grade), starting elevation,
#             time of day, cumulative time, cumulative elevation gain, activity type
flats_model <- lm(
  active_time_min ~ section_distance_mi + net_elevation_change_ft +
    calculated_grade_percent + log_abs_grade + start_elevation_ft +
    start_hour + cumulative_time_min + cumulative_elevation_gain_ft +
    activity_type,
  data = flats_data
)

message("  ✓ Flats model built")

# Model 3: Descending time prediction
# Predictors: distance, elevation loss, grade, log(grade), starting elevation,
#             time of day, cumulative time, cumulative elevation gain, activity type
descent_model <- lm(
  active_time_min ~ section_distance_mi + elevation_loss_ft +
    calculated_grade_percent + log_abs_grade + start_elevation_ft +
    start_hour + cumulative_time_min + cumulative_elevation_gain_ft +
    activity_type,
  data = descent_data
)

message("  ✓ Descending model built")

# Model 4: Total rest time prediction (activity-level)
# Predict total rest time for entire activity based on total distance, elevation, and active time
message("\nBuilding rest time model (activity-level)...")

# Create activity-level dataset
rest_data <- terrain_sections %>%
  group_by(activity_id) %>%
  summarise(
    total_distance_mi = sum(section_distance_mi, na.rm = TRUE),
    total_elevation_gain_ft = sum(elevation_gain_ft, na.rm = TRUE),
    total_net_elevation_change_ft = sum(net_elevation_change_ft, na.rm = TRUE),
    total_active_time_min = sum(active_time_min, na.rm = TRUE),
    .groups = "drop"
  ) %>%
  # Join with activity metadata to get total duration and activity type
  left_join(
    activity_metadata %>% select(activity_id, total_duration_min, activity_type),
    by = "activity_id"
  ) %>%
  # Calculate rest time
  mutate(
    total_rest_time_min = total_duration_min - total_active_time_min,
    # Convert activity type to factor
    activity_type = as.factor(if_else(is.na(activity_type) | activity_type == "",
                                      "Unknown", activity_type))
  ) %>%
  # Filter for quality data (positive rest time, reasonable values)
  filter(
    total_rest_time_min >= 0,
    total_active_time_min > 0,
    total_distance_mi > 0
  )

message(paste("  Using", nrow(rest_data), "activities for rest model"))

# Build rest time model
rest_model <- lm(
  total_rest_time_min ~ total_distance_mi + total_elevation_gain_ft +
    total_net_elevation_change_ft + total_active_time_min + activity_type,
  data = rest_data
)

message("  ✓ Rest time model built")

## Evaluate models ----

message("\nEvaluating model performance...")

# Function to calculate model metrics
evaluate_model <- function(model, data, terrain_name) {
  predictions <- predict(model, data)
  actual <- data$active_time_min

  # Calculate metrics
  rmse <- sqrt(mean((actual - predictions)^2, na.rm = TRUE))
  mae <- mean(abs(actual - predictions), na.rm = TRUE)
  r_squared <- summary(model)$r.squared
  adj_r_squared <- summary(model)$adj.r.squared

  # Residual analysis
  residuals <- actual - predictions

  tibble(
    terrain = terrain_name,
    n_sections = nrow(data),
    r_squared = r_squared,
    adj_r_squared = adj_r_squared,
    rmse_min = rmse,
    mae_min = mae,
    mean_actual_min = mean(actual, na.rm = TRUE),
    mean_predicted_min = mean(predictions, na.rm = TRUE)
  )
}

# Evaluate section-level models
performance_metrics <- bind_rows(
  evaluate_model(climb_model, climb_data, "Climbing"),
  evaluate_model(flats_model, flats_data, "Flats"),
  evaluate_model(descent_model, descent_data, "Descending")
)

# Evaluate rest model (activity-level)
rest_predictions <- predict(rest_model, rest_data)
rest_actual <- rest_data$total_rest_time_min

rest_metrics <- tibble(
  terrain = "Rest (Activity)",
  n_sections = nrow(rest_data),
  r_squared = summary(rest_model)$r.squared,
  adj_r_squared = summary(rest_model)$adj.r.squared,
  rmse_min = sqrt(mean((rest_actual - rest_predictions)^2, na.rm = TRUE)),
  mae_min = mean(abs(rest_actual - rest_predictions), na.rm = TRUE),
  mean_actual_min = mean(rest_actual, na.rm = TRUE),
  mean_predicted_min = mean(rest_predictions, na.rm = TRUE)
)

# Combine all metrics
performance_metrics <- bind_rows(performance_metrics, rest_metrics)

message("\n=== Model Performance ===")
for (i in seq_len(nrow(performance_metrics))) {
  row <- performance_metrics[i, ]
  message(paste0("\n", row$terrain, ":"))
  message(paste("  R² =", sprintf("%.3f", row$r_squared)))
  message(paste("  Adj R² =", sprintf("%.3f", row$adj_r_squared)))
  message(paste("  RMSE =", sprintf("%.2f", row$rmse_min), "minutes"))
  message(paste("  MAE =", sprintf("%.2f", row$mae_min), "minutes"))
}

## Variable importance ----

message("\nCalculating variable importance...")

# Function to extract variable importance from model
get_variable_importance <- function(model, terrain_name) {
  # Get standardized coefficients
  model_summary <- summary(model)
  coefs <- coef(model_summary)

  # Calculate relative importance using standardized coefficients
  if (nrow(coefs) > 1) {
    var_names <- rownames(coefs)[-1]  # Exclude intercept
    t_values <- abs(coefs[-1, "t value"])
    p_values <- coefs[-1, "Pr(>|t|)"]
    estimates <- coefs[-1, "Estimate"]

    importance_df <- tibble(
      terrain = terrain_name,
      variable = var_names,
      coefficient = estimates,
      abs_t_value = t_values,
      p_value = p_values,
      significant = p_values < 0.05
    ) %>%
      arrange(desc(abs_t_value))

    return(importance_df)
  }

  return(tibble())
}

# Get importance for all models
importance_climb <- get_variable_importance(climb_model, "Climbing")
importance_flats <- get_variable_importance(flats_model, "Flats")
importance_descent <- get_variable_importance(descent_model, "Descending")

variable_importance <- bind_rows(
  importance_climb,
  importance_flats,
  importance_descent
)

## Create diagnostic plots ----

message("\nGenerating diagnostic plots...")

# Function to create actual vs predicted plot
create_prediction_plot <- function(model, data, terrain_name, color) {
  predictions <- predict(model, data)
  actual <- data$active_time_min

  plot_data <- tibble(
    actual = actual,
    predicted = predictions
  )

  ggplot(plot_data, aes(x = actual, y = predicted)) +
    geom_point(alpha = 0.5, color = color, size = 2) +
    geom_abline(intercept = 0, slope = 1, linetype = "dashed", color = "#333333") +
    labs(
      title = paste(terrain_name, "- Actual vs Predicted"),
      x = "Actual Time (minutes)",
      y = "Predicted Time (minutes)"
    ) +
    theme_minimal() +
    theme(
      plot.title = element_text(size = 14, face = "bold"),
      axis.title = element_text(size = 11)
    )
}

# Create plots for section-level models
plot_climb <- create_prediction_plot(climb_model, climb_data, "Climbing", color_climbing)
plot_flats <- create_prediction_plot(flats_model, flats_data, "Flats", color_flats)
plot_descent <- create_prediction_plot(descent_model, descent_data, "Descending", color_descending)

# Create plot for rest model (activity-level)
rest_plot_data <- tibble(
  actual = rest_actual,
  predicted = rest_predictions
)

plot_rest <- ggplot(rest_plot_data, aes(x = actual, y = predicted)) +
  geom_point(alpha = 0.5, color = color_rest, size = 2) +
  geom_abline(intercept = 0, slope = 1, linetype = "dashed", color = "#333333") +
  labs(
    title = "Rest Time Model - Predicted vs Actual",
    x = "Actual Rest Time (min)",
    y = "Predicted Rest Time (min)"
  ) +
  theme_minimal() +
  theme(
    plot.title = element_text(size = 14, face = "bold"),
    axis.title = element_text(size = 11)
  )

# Convert to plotly
plot_climb_ly <- ggplotly(plot_climb, tooltip = c("x", "y")) %>%
  layout(height = 400, margin = list(l = 60, r = 20, t = 50, b = 50))

plot_flats_ly <- ggplotly(plot_flats, tooltip = c("x", "y")) %>%
  layout(height = 400, margin = list(l = 60, r = 20, t = 50, b = 50))

plot_descent_ly <- ggplotly(plot_descent, tooltip = c("x", "y")) %>%
  layout(height = 400, margin = list(l = 60, r = 20, t = 50, b = 50))

plot_rest_ly <- ggplotly(plot_rest, tooltip = c("x", "y")) %>%
  layout(height = 400, margin = list(l = 60, r = 20, t = 50, b = 50))

## Save models ----

message("\nSaving models...")

# Create models directory if it doesn't exist
if (!dir.exists(models_dir)) {
  dir.create(models_dir, recursive = TRUE)
}

saveRDS(climb_model, file.path(models_dir, "climb_time_model.rds"))
saveRDS(flats_model, file.path(models_dir, "flats_time_model.rds"))
saveRDS(descent_model, file.path(models_dir, "descent_time_model.rds"))
saveRDS(rest_model, file.path(models_dir, "rest_time_model.rds"))

message(paste("  Models saved to:", models_dir))

## Build HTML report ----

message("\nBuilding HTML report...")

# Create HTML page
html_content <- tags$html(
  tags$head(
    tags$title("Time Prediction Models"),
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
      .plot-container {
        margin-bottom: 20px;
        padding: 15px;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
      }
      .table {
        font-size: 14px;
      }
      .terrain-climbing {
        background-color: rgba(255, 140, 0, 0.1);
      }
      .terrain-flats {
        background-color: rgba(65, 105, 225, 0.1);
      }
      .terrain-descending {
        background-color: rgba(42, 127, 42, 0.1);
      }
    "))
  ),
  tags$body(
    tags$div(
      class = "container",

      # Header
      tags$h1("Time Prediction Models"),
      tags$p(
        class = "lead",
        "Linear Models for Predicting Section Completion Time"
      ),

      # Model Performance Summary
      tags$h3("Model Performance", style = "margin-top: 30px; margin-bottom: 20px;"),
      tags$div(
        class = "table-responsive",
        tags$table(
          class = "table table-bordered",
          tags$thead(
            style = "background-color: #f8f9fa;",
            tags$tr(
              tags$th("Terrain Type", style = "text-align: left;"),
              tags$th("Sections", style = "text-align: right;"),
              tags$th("R²", style = "text-align: right;"),
              tags$th("Adj R²", style = "text-align: right;"),
              tags$th("RMSE (min)", style = "text-align: right;"),
              tags$th("MAE (min)", style = "text-align: right;"),
              tags$th("Mean Actual (min)", style = "text-align: right;"),
              tags$th("Mean Predicted (min)", style = "text-align: right;")
            )
          ),
          tags$tbody(
            lapply(seq_len(nrow(performance_metrics)), function(i) {
              row <- performance_metrics[i, ]
              terrain_class <- paste0("terrain-", tolower(row$terrain))

              tags$tr(
                class = terrain_class,
                tags$td(row$terrain, style = "text-align: left; font-weight: 500;"),
                tags$td(format(row$n_sections, big.mark = ","), style = "text-align: right;"),
                tags$td(sprintf("%.3f", row$r_squared), style = "text-align: right;"),
                tags$td(sprintf("%.3f", row$adj_r_squared), style = "text-align: right;"),
                tags$td(sprintf("%.2f", row$rmse_min), style = "text-align: right;"),
                tags$td(sprintf("%.2f", row$mae_min), style = "text-align: right;"),
                tags$td(sprintf("%.2f", row$mean_actual_min), style = "text-align: right;"),
                tags$td(sprintf("%.2f", row$mean_predicted_min), style = "text-align: right;")
              )
            })
          )
        )
      ),

      # Variable Importance
      tags$h3("Variable Importance", style = "margin-top: 40px; margin-bottom: 20px;"),
      tags$div(
        class = "table-responsive",
        tags$table(
          class = "table table-bordered table-sm",
          tags$thead(
            style = "background-color: #f8f9fa;",
            tags$tr(
              tags$th("Terrain", style = "text-align: left;"),
              tags$th("Variable", style = "text-align: left;"),
              tags$th("Coefficient", style = "text-align: right;"),
              tags$th("|t-value|", style = "text-align: right;"),
              tags$th("p-value", style = "text-align: right;"),
              tags$th("Significant", style = "text-align: center;")
            )
          ),
          tags$tbody(
            lapply(seq_len(nrow(variable_importance)), function(i) {
              row <- variable_importance[i, ]
              terrain_class <- paste0("terrain-", tolower(row$terrain))

              tags$tr(
                class = terrain_class,
                tags$td(row$terrain, style = "text-align: left; font-weight: 500;"),
                tags$td(row$variable, style = "text-align: left;"),
                tags$td(sprintf("%.4f", row$coefficient), style = "text-align: right;"),
                tags$td(sprintf("%.2f", row$abs_t_value), style = "text-align: right;"),
                tags$td(sprintf("%.4f", row$p_value), style = "text-align: right;"),
                tags$td(
                  if (row$significant) "✓" else "",
                  style = "text-align: center; color: #28a745;"
                )
              )
            })
          )
        )
      ),

      # Diagnostic Plots
      tags$h3("Actual vs Predicted", style = "margin-top: 40px; margin-bottom: 20px;"),
      tags$p(
        "Diagonal line shows perfect prediction. Points closer to the line indicate better model fit.",
        style = "color: #666; margin-bottom: 20px;"
      ),
      tags$div(
        class = "row",

        # Climbing plot
        tags$div(
          class = "col-md-4",
          tags$div(
            class = "plot-container",
            plot_climb_ly
          )
        ),

        # Flats plot
        tags$div(
          class = "col-md-4",
          tags$div(
            class = "plot-container",
            plot_flats_ly
          )
        ),

        # Descending plot
        tags$div(
          class = "col-md-4",
          tags$div(
            class = "plot-container",
            plot_descent_ly
          )
        )
      ),

      # Rest Model Plot (full width)
      tags$h4("Activity-Level Rest Time Model", style = "margin-top: 30px; margin-bottom: 15px;"),
      tags$div(
        class = "row",
        tags$div(
          class = "col-md-6 offset-md-3",
          tags$div(
            class = "plot-container",
            plot_rest_ly
          )
        )
      ),

      # Model Equations
      tags$h3("Model Equations", style = "margin-top: 40px; margin-bottom: 20px;"),
      tags$p(
        "Note: Activity type is included as a categorical variable with multiple coefficients (one per activity type).",
        style = "color: #666; font-size: 13px; margin-bottom: 20px;"
      ),
      tags$div(
        tags$h5("Climbing:", style = "margin-top: 20px;"),
        tags$pre(
          style = "background-color: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 11px;",
          paste(
            "Active Time (min) = Intercept +",
            sprintf("%.4f", coef(climb_model)[2]), "× Distance (mi) +",
            sprintf("%.4f", coef(climb_model)[3]), "× Elevation Gain (ft) +",
            sprintf("%.4f", coef(climb_model)[4]), "× Grade (%) +",
            sprintf("%.4f", coef(climb_model)[5]), "× log(|Grade| + 1) +",
            sprintf("%.4f", coef(climb_model)[6]), "× Start Elevation (ft) +",
            sprintf("%.4f", coef(climb_model)[7]), "× Start Hour +",
            sprintf("%.4f", coef(climb_model)[8]), "× Cumulative Time (min) +",
            sprintf("%.4f", coef(climb_model)[9]), "× Cumulative Elev Gain (ft) +",
            "Activity Type Effects"
          )
        ),

        tags$h5("Flats:", style = "margin-top: 20px;"),
        tags$pre(
          style = "background-color: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 11px;",
          paste(
            "Active Time (min) = Intercept +",
            sprintf("%.4f", coef(flats_model)[2]), "× Distance (mi) +",
            sprintf("%.4f", coef(flats_model)[3]), "× Net Elevation Change (ft) +",
            sprintf("%.4f", coef(flats_model)[4]), "× Grade (%) +",
            sprintf("%.4f", coef(flats_model)[5]), "× log(|Grade| + 1) +",
            sprintf("%.4f", coef(flats_model)[6]), "× Start Elevation (ft) +",
            sprintf("%.4f", coef(flats_model)[7]), "× Start Hour +",
            sprintf("%.4f", coef(flats_model)[8]), "× Cumulative Time (min) +",
            sprintf("%.4f", coef(flats_model)[9]), "× Cumulative Elev Gain (ft) +",
            "Activity Type Effects"
          )
        ),

        tags$h5("Descending:", style = "margin-top: 20px;"),
        tags$pre(
          style = "background-color: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 11px;",
          paste(
            "Active Time (min) = Intercept +",
            sprintf("%.4f", coef(descent_model)[2]), "× Distance (mi) +",
            sprintf("%.4f", coef(descent_model)[3]), "× Elevation Loss (ft) +",
            sprintf("%.4f", coef(descent_model)[4]), "× Grade (%) +",
            sprintf("%.4f", coef(descent_model)[5]), "× log(|Grade| + 1) +",
            sprintf("%.4f", coef(descent_model)[6]), "× Start Elevation (ft) +",
            sprintf("%.4f", coef(descent_model)[7]), "× Start Hour +",
            sprintf("%.4f", coef(descent_model)[8]), "× Cumulative Time (min) +",
            sprintf("%.4f", coef(descent_model)[9]), "× Cumulative Elev Gain (ft) +",
            "Activity Type Effects"
          )
        ),

        tags$h5("Rest Time (Activity-Level):", style = "margin-top: 20px;"),
        tags$pre(
          style = "background-color: #f8f9fa; padding: 15px; border-radius: 5px; font-size: 11px;",
          paste(
            "Total Rest Time (min) = Intercept +",
            sprintf("%.4f", coef(rest_model)[2]), "× Total Distance (mi) +",
            sprintf("%.4f", coef(rest_model)[3]), "× Total Elevation Gain (ft) +",
            sprintf("%.4f", coef(rest_model)[4]), "× Total Net Elevation Change (ft) +",
            sprintf("%.4f", coef(rest_model)[5]), "× Total Active Time (min) +",
            "Activity Type Effects"
          )
        )
      )
    )
  )
)

## Save HTML ----

output_file <- file.path(validation_dir, "time_prediction_models.html")
message(paste("\nSaving HTML report to:", output_file))

# Save the HTML file
save_html(html_content, file = output_file)

message(paste("✓ Report saved:", output_file))

message("\n=== Stage 6 Complete ===")
message(paste("Models saved to:", models_dir))
message(paste("Report saved to:", output_file))
