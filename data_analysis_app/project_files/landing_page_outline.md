# Outline for the landing page

## Goal

To have a page that facilitates the admin login or navigation to the "view only" experience.

To show off a summary of the cool features in a single view.


## Structure

### Header

Should look the same as the genearl app header (with the Mountain G.O.A.T. titles), but instead of the 5 buttons at the top, we should have just two:
- "View Activity Analysis" (Orange button)
- "Admin Login" (grey button)


### Body

The general structure of the body is a flow of images and text that breaks out the key features of the app, and highlights what is cool about the analysis.

I would like the page to have an orange "path" running down the middle with the images appearing on the left and the text appearing on the right. The styling should be similar to the activty edit page.

We are going to start with the end (the coolest thing the app can do), and then work back through all the steps it takes to get there.

#### Generate Predicted Activity Times

Image Path: data_analysis_app/project_files/demo_images/time_prediction_01.png

Body: Simulates a range of possible route times based on the user's real activity data. Outputs highlight how likely the user is to summit in a safe window, and get back before dark (based on a selected start date and time).

Mounaineering is inherently unpredictable, so the models use a Bayseian framework to realistincly represent the level of uncertainty in its predictions.

#### Create Plans Based on Real GPS Traces

Image Path: data_analysis_app/project_files/demo_images/planned_routes_01.png

Body: Evaluates real GPS traces from past climbs. User can upload data from any past activity, and use it to generate a custom prediction based on their own data.

#### Get Detailed Reviews of Model Accuracy

Image Path: data_analysis_app/project_files/demo_images/model_view_02.png

Body: Custom models are trained for different segments of each activity, allowing for a higher degree of accuracy. 

Technical climbing models use a complex set of inputs including difficulty, pitch count, and familiarity with the route. All models factor in time of day, effort already exerted in the activity, and impact of pack weight. 

#### Explore Trends in Activity Data

Image Path: data_analysis_app/project_files/demo_images/trend_analysis_01.png

Body: Rich analysis of past activities itentifies key trends that underly the time prediction models. Analysis is interactive making it easy to identify outliers and understand what is driving trends in past activities.

#### Tag Activities with Key Details About the Route

Image: data_analysis_app/project_files/demo_images/route_segments_01.png

Body: Segments are automatically generated from the activity, but can be edited by the user to an incredible level of detail. 

Key context about the route (including technical difficulty, terrain type, and pack weight) can by edited on a segment by segment basis, allowing for the most accurate possible models.

#### Clean Bad Waypoints and Erroneous Tracks

Image path: data_analysis_app/project_files/demo_images/route_edit_01.png

Body: Messy GPS data can lead to inflated distances and bad predictions. The user is able to clean traces on a point by point basis to ensure good data is flowing into the model.

#### Complie Activities from Any Source 

Image path: data_analysis_app/project_files/demo_images/activity_editor_01.png

Body: Collects activities from multiple sources and organizes them for easy data cleaning, and context rich tagging. The user is also able to run predictions on any past activity, making planning for future routes easier.