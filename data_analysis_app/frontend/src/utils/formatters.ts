/**
 * Utility functions for formatting data for display.
 */

/**
 * Format distance in miles with appropriate precision.
 */
export function formatDistance(miles: number | null | undefined): string {
  if (miles === null || miles === undefined) return 'N/A';
  return `${miles.toFixed(2)} mi`;
}

/**
 * Format elevation in feet.
 */
export function formatElevation(feet: number | null | undefined): string {
  if (feet === null || feet === undefined) return 'N/A';
  return `${Math.round(feet).toLocaleString()} ft`;
}

/**
 * Format duration in seconds to HH:MM:SS or MM:SS format.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'N/A';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date string to readable format.
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format datetime string to readable format with time.
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Format pace (min/mile) to readable format.
 */
export function formatPace(minPerMile: number | null | undefined): string {
  if (minPerMile === null || minPerMile === undefined || minPerMile === 0) return 'N/A';

  const minutes = Math.floor(minPerMile);
  const seconds = Math.floor((minPerMile - minutes) * 60);

  return `${minutes}:${seconds.toString().padStart(2, '0')}/mi`;
}

/**
 * Format speed (mph) to readable format.
 */
export function formatSpeed(mph: number | null | undefined): string {
  if (mph === null || mph === undefined) return 'N/A';
  return `${mph.toFixed(1)} mph`;
}

/**
 * Format grade percentage.
 */
export function formatGrade(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return 'N/A';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

/**
 * Format activity type to display name.
 */
export function formatActivityType(type: string | null | undefined): string {
  if (!type) return 'Activity';

  // Capitalize first letter of each word
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format relative time (e.g., "3 days ago").
 */
export function formatRelativeTime(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'N/A';

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}
