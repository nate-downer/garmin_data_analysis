## Apply Manual Overrides (Stage 02b)
## Loads manual edits from Shiny app and applies them after automatic noise cleaning

message("\n=== Stage 02b: Applying Manual Overrides ===\n")

overrides_dir <- "manual_data_cleaning_app/overrides"

# Load automatically cleaned data from Stage 2
denoised_points <- read.csv(file.path(clean_data_dir, "denoised_points_data.csv"), stringsAsFactors = FALSE)
denoised_segments <- read.csv(file.path(clean_data_dir, "denoised_segments_data.csv"), stringsAsFactors = FALSE)
activity_metadata <- read.csv(file.path(clean_data_dir, "activity_metadata.csv"), stringsAsFactors = FALSE)

## 1. Apply removed points
removed_files <- list.files(
  file.path(overrides_dir, "removed_points"),
  pattern = "^activity_.*_removed_points\\.csv$",
  full.names = TRUE
)

if (length(removed_files) > 0) {
  removed_points <- bind_rows(lapply(removed_files, function(f) {
    read.csv(f, stringsAsFactors = FALSE)
  }))

  # Parse timestamps to match
  removed_points$timestamp <- ymd_hms(removed_points$timestamp)
  denoised_points$time <- ymd_hms(denoised_points$time)

  # Remove manually flagged points
  manually_cleaned_points <- denoised_points %>%
    anti_join(removed_points, by = c("activity_id", "time" = "timestamp"))

  message(paste("  Removed", nrow(removed_points), "manually flagged points"))
  message(paste("  Points before:", format(nrow(denoised_points), big.mark = ",")))
  message(paste("  Points after:", format(nrow(manually_cleaned_points), big.mark = ",")))
} else {
  manually_cleaned_points <- denoised_points
  manually_cleaned_points$time <- ymd_hms(manually_cleaned_points$time)
  message("  No manual point removals found")
}

# Recalculate segments after point removal
message("  Recalculating segments...")
manually_cleaned_segments <- calculate_segments(manually_cleaned_points)

## 2. Load technical sections for later stages
technical_files <- list.files(
  file.path(overrides_dir, "technical_sections"),
  pattern = "^activity_.*_technical_sections\\.csv$",
  full.names = TRUE
)

if (length(technical_files) > 0) {
  technical_sections <- bind_rows(lapply(technical_files, function(f) {
    read.csv(f, stringsAsFactors = FALSE)
  }))

  # Parse timestamps
  technical_sections <- technical_sections %>%
    mutate(
      start_time = ymd_hms(start_time),
      end_time = ymd_hms(end_time)
    )

  # Save for Stage 3 to use
  write.csv(technical_sections,
            file.path(clean_data_dir, "manual_technical_sections.csv"),
            row.names = FALSE)

  message(paste("  Loaded", nrow(technical_sections), "technical climbing sections"))
} else {
  message("  No technical sections defined")
}

## 3. Merge metadata
metadata_files <- list.files(
  file.path(overrides_dir, "metadata"),
  pattern = "^activity_.*_metadata\\.csv$",
  full.names = TRUE
)

if (length(metadata_files) > 0) {
  manual_metadata <- bind_rows(lapply(metadata_files, function(f) {
    read.csv(f, stringsAsFactors = FALSE)
  }))

  # Merge with activity metadata
  activity_metadata <- activity_metadata %>%
    left_join(
      manual_metadata %>% select(activity_id, weight_carried, weight_unit, party_size),
      by = "activity_id"
    )

  message(paste("  Merged metadata for", nrow(manual_metadata), "activities"))
} else {
  # Add empty columns so downstream stages don't break
  activity_metadata$weight_carried <- NA_real_
  activity_metadata$weight_unit <- NA_character_
  activity_metadata$party_size <- NA_integer_
  message("  No manual metadata found")
}

## Save manually cleaned data
write.csv(manually_cleaned_points,
          file.path(clean_data_dir, "manually_cleaned_points_data.csv"),
          row.names = FALSE)
message(paste("  Saved:", file.path(clean_data_dir, "manually_cleaned_points_data.csv")))

write.csv(manually_cleaned_segments,
          file.path(clean_data_dir, "manually_cleaned_segments_data.csv"),
          row.names = FALSE)
message(paste("  Saved:", file.path(clean_data_dir, "manually_cleaned_segments_data.csv")))

write.csv(activity_metadata,
          file.path(clean_data_dir, "activity_metadata.csv"),
          row.names = FALSE)
message(paste("  Saved:", file.path(clean_data_dir, "activity_metadata.csv")))

message("\n=== Stage 02b Complete ===")
message(paste("  Final point count:", format(nrow(manually_cleaned_points), big.mark = ",")))
