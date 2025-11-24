/**
 * Netlify Function: YouTube Playlist Fetcher
 * Securely fetches YouTube playlist items without exposing API key
 */

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { playlistId } = JSON.parse(event.body);

    if (!playlistId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Playlist ID is required' })
      };
    }

    // API key stored securely in Netlify environment variables
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
    const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

    if (!YOUTUBE_API_KEY) {
      console.error('YOUTUBE_API_KEY not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' })
      };
    }

    let allItems = [];
    let nextPageToken = '';

    // Fetch all pages of playlist items
    do {
      const url = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Failed to fetch playlist');
      }

      allItems = allItems.concat(data.items || []);
      nextPageToken = data.nextPageToken || '';

    } while (nextPageToken);

    // Get video IDs
    const videoIds = allItems.map(item => item.contentDetails.videoId).filter(id => id);

    if (videoIds.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify([])
      };
    }

    // Fetch video details in batches of 50
    const videoDetails = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const detailsUrl = `${YOUTUBE_API_BASE}/videos?part=contentDetails&id=${batch.join(',')}&key=${YOUTUBE_API_KEY}`;

      const response = await fetch(detailsUrl);
      const data = await response.json();

      if (data.items) {
        videoDetails.push(...data.items);
      }
    }

    // Create duration map
    const durationMap = {};
    videoDetails.forEach(video => {
      durationMap[video.id] = video.contentDetails.duration;
    });

    // Map to song format
    const songs = allItems.map(item => {
      const snippet = item.snippet;
      const videoId = item.contentDetails.videoId;
      const duration = durationMap[videoId] || 'PT0S';

      return {
        id: videoId,
        title: snippet.title,
        artist: snippet.channelTitle || 'Unknown Artist',
        thumbnail: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
        duration: duration
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(songs)
    };

  } catch (error) {
    console.error('Playlist fetch error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message || 'Failed to fetch playlist'
      })
    };
  }
};
