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

### Add Activity
- The user should have the ability to add an activity to the app by clicking on a button on the home page.
- This should give the user the ability to upload a gpx file from their machiene.
- The user should be able to flag whether this is an activity they did, or if it is a route for a planned activity. This second type of activity does not need a UX yet, but will be used later.

### Other
- We need to add a feature that identifies what timezone each activity started in, and applies the correct time adjustment so that all the activity times match real time.
- Would like to add a section in the meta-data view for each activity that allows the user to rename the activity.

### Acceptance Criteria:
- [x] Plots are updated with improved scaling
- [x] Add activity flow is present
- [x] Timezones are reflected correctly
- [x] user can edit the activity name


## Milestone 0.4 - Automated Segmentation

In this milestone, I would like to revamp how segmentation is done to automate the process and increase the granularity around the rest periods.

Here is how we are going to do this:
- Step 1: Identify periods of inactivity. Calculate the rolling average speed (across 3 min rolling intervals) and find all periods where the speed drops below 0.05 mph. Label all points that are considered inactive.
- Step 2: Identify periods of long rest. Find all periods of continuious inactivity longer than 10 minutes. Create these segments as "Long Rests" (i.e. Terrain Type = "Rest"). Store this segment data.
- Step 3: Create the rest of the segments by filling in the space between these "Long Rests" with non-technical segments.

From here the user will be prompted to further refine these automated segments by doing one the the following 3 actions:
- Split segment - The user picks a point and splits an existing segment into two segments. Both segments keep the same technical rating by default, but we recalculate the stats for each segment, so a segment can become a climb or descent.
- Merge with next / merge with previous - The user choses to merge the selected segment into the segment before or after. When doing this the segment inherits the technical rating and metadata of the segment it is merged into.
- Adjust segment boundary - The users shifts the time that a particular segment starts or ends. Doing this also shifts the time the the adjacet segment starts or ends to ensure 100% coverage with no overlap.

Enabling this UI wil require a prety substantial redesign of the segment UI. We will keep the UI in the right side bar, but I would like to implement the following strucutre:
- I want toe keep the UI what we curently have when the segment is "closed"
- When the segment is opened, I would like to keep the same stat summary section, but replace the "activity type" with "Ave. % Grade" and add "Ave Climb Rate" in Ft per Hour (this cam be negative for descents)
  - I would also like to add a "% Inactive" stat to the stats section, that show the % of time the users was inactive durring that segment.
- I want to keep the three position slider for rest, non-thecnical, technical
- I would like to remove the update and delete buttons, and have the segment update automatically when the user clicks out of the segment box
- I would like to add five buttons to the bottom of the segment box:
  - Split Segment - Re-scales the time serries plots to show only the current segment, and prompts the user to pick the point where they want to split the segment
  - Merge with Prior 
  - Merge with Next
  - Adjust Start - Re-scales the time serries plot to show the the full current segment, and the full prior segment. Prompts the user to pick a new point to divide the two segments.
  - Adjust End - Re-scales the time serries plot to show the the full current segment, and the full next segment. Prompts the user to pick a new point to divide the two segments.

Additionally I would like to remove the "create segment" button at the top of the segments UI and replace it with a "Generate Segments" button. When the user clicks on this they should be given a warning that this will delete existing segment data.

When the user is adding a new activity, segments should be autommatically calculated for the new actvity.

### Acceptance Criteria:
- [x] Periods of inactivity are automatically tagged.
- [x] Rest segments are automatically identified, and periods between rests are filled in as non-technical segments.
- [x] The segment UI is updated, and the user has the ability to split, merge, and adjust segments using the map interface.


## Milestone 0.5 - Comparative Analysis Tools

In this milestone I would like to implement Pandolf Equation to calculate the energy being used to acomplish each section. The equation is:

M = 1.5W + 2.0(W + L)(L / W)^2 + n(W + L)(1.5V^2 + 0.35VG)

To implement this we will need to add the following parameters to each segment:
- W: The user's body weight (in kilograms)
- L: The load the user is carying (in kilograms)
- V: Velocity (in meters per second)
- G: Grade (percent grade)
- n: Terrain Factor (from the list below)

Terrain Factors:
  Blacktop road or treadmill  1.0
  Dirt road	                  1.1
  Light brush	              1.2
  Heavy brush	              1.5
  Swampy bog	              1.8
  Loose sand	              2.1

I would like to take the output of this to calcualte the average power for the segment, and the total energy (in calories) used in the segment. Ultimately, I would like to use the power output as another feature in the prediciton algorithim.

### Acceptance Criteria:
- [x] The activity meta-data is updated to include a terrain type selector
- [x] The segment meta-data is update to include the weight and terrain type for each segment. The is inherited from the activity by default, but the user can change this for each segment if they want to.
- [x] The appropriate databse updates are made to support these changes.
- [x] The Pandolf equation is implemented to calculate average power and total engery used for all non-technical segments. Technical segments are excluded because the equation is not designed to work for proper climbing.
- [x] Average power and total energey used are included as summary starts calculated for each segment.


## Milestone 0.6 - Activity Analysis

In this update I would like to add a new page (accesible by clicking on the View Analysis button) that allows the user to see an analysis of all of their activities and segments.

The analysis should have the following sections:
- Activity Analysis
  - Time serries plot that shows elevation over time traces for all activities
  - Scatter plot of total time vs. total distance
  - Scatter plot of total time vs. total elevation
  - Horizontal bar plot with top 10 activities by total distance
  - Horizontal bar plot with top 10 activities by total elevation
- Climb Segment Analysis
  - Time serries plot that shows elevation over time for all climb segments
  - Scatter plot of total time vs. total distance
  - Scatter plot of total time vs. total elevation
  - Horizontal bar plot with top 10 segments by rate of climb
  - Horizontal bar plot with top 10 activities by total elevation
  - Scatter plot with ave pct grade vs. ave speed
  - scatter plot with ave power vs. ave rate of climb

Additonal plots will be specified after the inital plots are added.

### Acceptance Criteria:
- [ ] New Activity Analysis page is added
- [ ] All specified plots have been added in a two column format
- [ ] Additonal plots specified later have been added



## Future Work:
- [ ] Create comparison visualizations across segments and activities
- [ ] Create a prediciton algorithim using a baysian model.
- [ ] Allow the user to predict their time on other routes.
- [ ] Figure out if total elevation gain is bugged / ensure total calculations work better
- [ ] Make the dot field more fun / interactive