# App Specifications

## Purpose:

This app exists so that users can:
- View past activities.
- Add new activities to the database.
- Mannualy clean their gps data and add helpful meta data.
- See trends in their past activities.
- Use the cleaned data to create a predictive model the will predict how quickly they can complete planned activities.

Ultimately I want this to be a planning tool that people can use to help anticipate how hard mountain objectives will be, and take appropriate percautions. 


## General Structure:

There are five main interfaces we will need to build:
- Homepage
- Activity Viewer / Editor
- Cross Activity Analysis
- Predictive Model Runner / Tuner
- Activity Planner

### Homepage:

The homepage will have a header section at the top with buttons for key actions, as well as an interface with a list of all activities. Each activity will display as a wide horizontal box. Clicking on a box will open up the avtivity viewer / editor as a drop down below the box.

#### Header:

The header will include buttons for the following actions:
- Add Activities
- View Analysis
- Build Model
- Plan Activity

Below the header buttons there should be boxes with summary stats for:
- Total Activities
- Total Distance
- Total Elevation Gain
- Days Since Last Activity

#### Activity List:

The Activity list section should be comprised of wide horizontal boxes. To the left of the boxes there should be a tall vertical line that each box is attached to, suggesting that the whole interface is a timeline. Clicking on a box will open up the activity viewer / editor as a drop down interface.

In its collapsed view, the box should display the following data for each activity:
- Activity Date
- Activity Name
- Total Time
- Total Distance
- Total Elevation Gain

### Activity Editor:

When the user clicks on an activity, the activity editor should open as a drop down. The interface should include include two pannels:

#### Data pannel (left):
- A map of the activity.
- A trace showing elevation over time.
- A trace showing speed over time.

#### Segment Pannel (right):
- A list of activity segments.
- An interface wher the user is prompted to add meta-data for the full activity.

The key things that the user should be able to do in this interface are:
- Edit the gps trace (manually removing points from either the map or the trendlines).
- Edit the metadata (i.e. specify how much weight they were carying).
- Manually add segments to the trace.

#### Segments:
Segments are user defined parts of the activity where there was a consistent type of effort. There are four types of segments:
- Climb
- Descent
- Flat
- Rest

Climbs and escents can be flagged as either technical or non-technical. If the user defines a section as a technical climb, they should be prompted to add the difficulty of the technical climbing, and whether it was roped or unroped. For thechnical descents, the users should be prompted to add the number of rappels done.

### Cross Activity Analysis
To be added.

### Predictive Model Runner / Tuner
To be added.

### Activity Planner
To be added.
