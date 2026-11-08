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
- [x] New Activity Analysis page is added
- [x] All specified plots have been added in a two column format
- [x] Additonal plots specified later have been added


## Milestone 0.7 - Model Creation

In this milestone, I would like to create a heirarchical bayseian model that takes the data from the segments and predicts the time that each segment will take.

My challenge is I have a lot of variable with a high degree of covarience:
- Total elevation game
- Total distance
- Total energy expended

I would like to use a heirarchical model to create a single factor out of these three factors adn then use that as a predictor in the lower level model.

I also need to create six differnt models...
- Time prediciton for technical climbing segments
- " non-technical climbing segments
- " flat segments
- " non-technical descents
- " technical descents
- Total rest time as a function of total distance and elevation gain

We will put all six of these models together to be able to predict the ammount of time it will take take complete an arbitrary trace later.


### UI

For the UI, I would like to add a new page that the user can access by clicking on the build model button at the top of the interface.

I would like to generate a set of diagnostic plots for each of the six models. To start with, lets do two per model:
- In the left column I would like to see the % of varriance explained by each var in the model (as a horizontal bar plot with error bars).
- In the right column I would like to see the prediceted vs. actual time for each segment inthe model.

I would like each model to have both plots.


### UAC

- [x] The UI exists with two plots for each model
- [x] The heirarchical model is implemented as described


## Milestone 0.8 - Add time prediciton interface

In this milestone I would like to add the UI for predicting the time for future routes based on the results of a selected model.

There are a few key parts to this:

### Interface for creating the segments for the test routes

We need an edit page (similar to the one for recorded activities) that allows the user to clean and add segments to routes that will be used for predictions.

In addition to the segment editing the user should be able to set the following variables for the time prediction:
- Group size
- Pack weight
- User weight
- Start time

I would also like the user to be able to pick the model they want to use for the prediciton from a list of all models.

### Back end integration for the predictions

I would like to run several differnt predictions for each segment, and the get the mean predicted time for each segment.

I would also like to so the same thing for rest times.

### Prediction visualizations

I want to make use of the baysean frame work to generate a prediction for each segment that shows the distribution of times. I would like to start with two visualizations:
- A distribution plot showing the mean total time and distribution around the mean
- A line plot showing the total distance (on the x axis) and total time (on the y axis) showing the average time prediction for each segment connected to each other. This should have the effect of showing cumulative time over distance. I would like to add a "rest" segment after each segment that is 1 / (segment count - 1) of the total rest time.


### UAT

- [x] Adds interface for editing the segments traces used for projections
- [x] Adds back end integration for making time predicitons
- [x] Adds prediction parameters in the edit interface
- [x] Adds visualizations showing the distribution of total time predictions and a line plot showing time as a funciton of distance.
- [x] Add plots with distribution of active time (ignoring rests)
- [x] Add plot with time as a funciton of elevation gain
- [x] Make it possible to run time predictions on past activities and show the actual vs. predicted.
- [x] Improve the plots by changing the colors past 1 SD from the mean and adding segment based colors
- [x] Move the plots into the main body of the thing
- [x] Make it easier to see the projected summit time / fix time zones in plots


## Milestone 0.9 - Improve the Model Formula and Accuracy

Ok there are a number of improvements to be made to the formula for the model and overall accuracy.

I want to switch back to a structure where the same "effort" model is used across all the differnt sub models instead of running this seperatly. To do this we will need to find a way to seed up the running of the model becuase right now it is too slow to work this way.

### Decision Point 1 - How do we speed up the model

### Updates to Model structure

In terms of the structure, I would like various components of the effort model to use diminishing returns curves (similar to the ones implemented in the analysis section) such that the ammount of effor increases exponentially as the distance and elevation increases.

I would then like the synthetic "effort" metric to have a linear relationship with time in the second layer of models.

### Updates to the Equation

For the equation of the model, I would like to do something like:

time = effort * (load ratio + terrain_factor + party_size + activity_type + cumulative_distance + cumulative_elevation + tod_modifier + experience_modifier)

Note that I think all the other factors should scale with relative effort (because a heavy backpack will slow you down in porportion to how far you have to carry it).

I added two new terms here that should also be shared across models:
- tod_modifier is the time of day modifier. this should be a serries to two harmonic sine waves that fit across the 24 hour period and generally express how much faster or slower people move based on the time of day.
- experience_modifier. I would like to add a new factor that the user selects once for each activity called "Experienc level". This should have 4 levels:
  - New Route + New Skills
  - New Route - Familier Skills
  - Somewhat Familier Route
  - Familier Route

The idea is that people will move faster on terrain that they are used to, with gear they are used to.

Note that we will need to update the UI so that the user is prompted to set this for each activity and prediction. When we maek the back end changes for this, we can use "New Route - Familier skills" as the default.


### Improving rest time

For the rest time model, I would also like to add a factor that represents the % of elevation gain in a route that is from technical climbing. Technical climbing tends to have lots of rest built in (belays etc.) so I would expect there to be less dedicated rest time on activities with a lot of technical climbing relative to other activity types.

### UAC

- [x] Model is re-structured as heirarchical
- [x] Model back end is sped up substantailly
- [x] New equation is implemented across all the appropriate models
- [x] New UI is added for the use to ad the level of expecince with the route
- [x] New rest time factor is implemented


### Additional Small Updates

- [x] Make editing the activity type possible
- [x] Remove planned actitivies from the analysis section and models
- [x] Move the familiarity selector into the predict time accordion
- [x] Improve the plots in the models evalutation seciton and add colors
- [x] Make the analysis seciton better (with best fit curves that don't suck)
- [x] Add a landing page (with explination of the project)
- [x] Fix bug that stops segments from loading right away after generation


## Milestone 1.0 - Host App 

Ok there is going to be a lot to cover with this one. A few main topics off the top of my head:

- View only mode: What controls are enables, what data gets hidden, etc.
- Log in and security: How do I set up a password based adming login for myself? Can we make it flexible enough to have other people's data in it one day in the future? Should we be able to flag certain activities as private and hide them from the general view?
- Hosting: Where? How? How much?
- Deployment: What will deploying updates to the public site look like? will I need to have dev adn staging versions? what will the structure for all of that be?

Breaking this out:

### Viewer Mode:

In this mode, I would like people to be able to see all the data but not edit anything. They should not be able to press any buttons that would write data to the back end or cause models to run.

In this mode, I would like there to be a banner at the top of the page remnding users "You are in Viewer Mode, some funcitonality is disabled". If the user ever clicks on a button that would write or update data, they should get a notification that says, "This feature is disabled in Viewer mode"

Here's how this should work on key pages:
- Edit Actvities: User can open activities, move through the accordian, and select particular segments, but cannot edit metadata, update points, edit segments, or run new time predictions.
- View Analysis: this is all fine to view as it
- Run models: users can selecte different historical modesl to view, but cannont run a new model.
- Plan Activities: same as edit activities.
- Add Activity: this button will still open up the widow for uploading, but the save activity button should be disables.

Note that in the near future I will want to move to a three level architecture:
- Viewer Mode - Can view public data but nothing else
- Client Mode - Individual users can view and edit their data but nothing else
- Admin Mode - Admin can view and edit everything and run models

We are not going to implement this right now, but please set up the tennancy structure with this in mind. I don't want to have to un-do and re-do too much work in this area.

As a part of this, I want activities to be flagged as public or private, within the metadata tab. Activities should be public by default, but can be set to private if the user chooses.

### Log-In

Relatedly I want to have to log in to access the admin account. I want the admin account to be linked to an email adress of mine with a password set up.

In the near future I would like to be able to invite other people to set up accounts, but we will get there in a later update.

### Hosting

I am happy with the plan as layed out in data_analysis_app/project_files/hosting_plan.md if we can keep the cost under $10/ month that would be excellent

### Deployment

I am not super familier with how these types of production deployment piplines work, so simpler would be better for me. If it is possible to have both a local "test" version and a public version that updates when I push code to a certain place that would be excellent. Please write a new "deployment process" md file so that I have a resource documenting how that process should work for me for the future.

NOTE: Instead of using the garmin-data-analysis repo for the public version of the app, I think I will want to start a clean repo called generative-outdoor-activity-tracker (without all the scratch files and test work) and use that for the public version. I will do this transition myself after we make the 1.0 updates but before we configure and deploy the public version.


### UAC:

- [x] The bones of a 3 layer tennancy structure are established.
- [x] The Viewer and Admin layers are implemented
- [x] The admin access is password protected
- [x] The app is configured such that it can be hosted publicly
- [x] Documentation on the new deployment pipeline is created
- [ ] The app's code is migrated to a new repo called generative-outdoor-activity-tracker (user will do this manually)


### Aditional UI Updates

- [ ] Better user / logout UI at the top of the window
- [ ] Better / more consistent rejection mesages when in the vwier mode


## Milestone 1.1 - Multiple client level users

Big things to think about:

- How multiple predictions for the same plan for differnt people are structured.
- Introducing models can can be fine tuned to an individual (based on priors from a global model)
- How public data will work (to start it should just Nate's data in the viewr version)
- Data sharing agreement so that we have permission to use people's data
- Setting up new accounts (I think this should be invite only to start)

--------------------------------------------------------------------------------------


## Future Work:
- [x] Create comparison visualizations across segments and activities
- [x] Create a prediciton algorithim using a baysian model.
- [x] Allow the user to predict their time on other routes.
- [ ] Figure out if total elevation gain is bugged / ensure total calculations work better
- [ ] Make the dot field more fun / interactive
- [x] Make the algorithims faster
- [ ] Pubish and host app
- [ ] Improve automted segment genneration
- [ ] Add the ability to split and merge whole activities (allowing a planned route to be broken into multiple days, or an approach and descent to be joined together for example)



