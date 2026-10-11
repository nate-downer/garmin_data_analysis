# Notes on Segmentation

## Problem Statement

This is a tricky one becasue I want to be able to do all of the following things:
- Enable audomated segmenting
- Allow the user to refine the segmentation
- Allow th user to specify technical secitons and their difficulty (so that the prediciton algorithim can handle them differently)
- Have the segments be primarily distance based so that it is easier to map the vars onto the the data we have from other GPX traces we are tyring to predict the time on
- Handle rest periods so that the user can see how long they are likely to rest, and what impact that will have on their total time

Rests present a number of particularily sticky problems:
- If some one rests at the end of a techical section, is that rest assigned to the technical section, or the section after it?
- Do we try to predict the rest time of the full activity, or do it per segment?
- Is there any way to differentiate between short recovery rests, and longer sitting and enjoying the susnset rests if both are in the sample?

One workable solution:
- We have the user idenfity only "long rests" where they were stopped for longer than was needed to recover.
- We add an algorithim that identifies periods of inactivity (2-5 min breaks where speed drops to 0), and we make this a "% inactive" stat that is applied to each segment.
- This also has the benifit of being closer to what we already have implemented. We can add "inactivity" detection, and keep the rest of the three zone segmentation.

