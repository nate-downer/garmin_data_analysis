# To-Do List

## Key Files
- data_analysis_app/project_files/app_specifications.md

## Milestone 0.1 - Exploratory Analysis and Modeling
This step was completed within the scope of the data_pipeline folder. The goal is not to create an app that is based on ther work in that analysis, but runs faster, is interactive, and allows for manual cleaning of the data.

## Milestone 0.2 - Design the Analysis Interface
The goal is to create an interactive app where the user can do the following.
- View all of their activities at a summary level.
- Open up individual activities to see the map, and elevation profile.
- Edit the GPS trace of the activity to remove erroneous points.
- Mannualy specify what they were doing at particular times in the activity (including tagging when they were doing technical rock climbing).
- Add meta-data to the activities, specifying how much weight they were carrying.

For more details on the app structure see the specifications document.

### Acceptance Criteria:
- [x] We have a working browser based app that can run locally on my machiene.
- [x] The user can see all activities and open individual activties to view the map and add metadata.
- [x] The app is moden and stylish.
- [x] The user can edit the gps data in the map to manually remove points.


## Milestone 0.3 - Improved UX and Add Activity

For this milestone, I want to streamline the UX to make it easier to edit metadata, select the right points on the plot when creating segments, and I want the ability to add new activities via the UI.

### Plots
- The timeseries plots have duplicate headers, I would like to remove both headers and make the y axis label larger to save space.
- The elevation plot needs to show automatically rescale the y axis so that we are using the full height of the plot space.
- I would like to add the ability to zoom in on the horizontal axis of the plots using a single slider that applies to both plots.

### Add Activity
- The user should have the ability to add an activity to the app by clicking on a button on the home page.
- This should give the user the ability to upload a gpx file from their machiene.
- The user should be able to flag whether this is an activity they did, or if it is a route for a planned activity. This second type of activity does not need a UX yet, but will be used later.

### Other
- We need to add a feature that identifies what timezone each activity started in, and applies the correct time adjustment so that all the activity times match real time.
- Would like to add a section in the meta-data view for each activity that allows the user to rename the activity.

### Acceptance Criteria:
- [ ] Plots are updated with zoom and improved scaling
- [ ] Add activity flow is present
- [ ] Timezones are reflected correctly
- [ ] user can edit the activity name


## Future Work:
- [ ] Create a prediciton algorithim using a baysian model.
- [ ] Allow the user to predict their time on other routes.