"""Timezone lookup and conversion utilities."""
from datetime import datetime
from timezonefinder import TimezoneFinder
import pytz


# Initialize timezone finder (singleton)
tf = TimezoneFinder()


def lookup_timezone(lat: float, lon: float) -> str:
    """
    Lookup timezone from coordinates.

    Args:
        lat: Latitude
        lon: Longitude

    Returns:
        Timezone string (e.g. "America/Denver")
    """
    timezone_str = tf.timezone_at(lat=lat, lng=lon)

    if not timezone_str:
        # Default to UTC if lookup fails
        timezone_str = "UTC"

    return timezone_str


def convert_to_local_time(utc_time: datetime, timezone_str: str) -> datetime:
    """
    Convert UTC time to local time.

    Args:
        utc_time: UTC datetime
        timezone_str: Timezone string (e.g. "America/Denver")

    Returns:
        Localized datetime
    """
    if not timezone_str or timezone_str == "UTC":
        return utc_time

    try:
        # Make UTC time timezone-aware if it isn't already
        if utc_time.tzinfo is None:
            utc_time = pytz.utc.localize(utc_time)
        else:
            utc_time = utc_time.astimezone(pytz.utc)

        # Convert to target timezone
        local_tz = pytz.timezone(timezone_str)
        local_time = utc_time.astimezone(local_tz)

        return local_time
    except Exception:
        # If conversion fails, return original time
        return utc_time
