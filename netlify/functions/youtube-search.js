/**
 * Netlify Function: YouTube Search
 * Securely searches YouTube without exposing API key to client
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
    const { query } = JSON.parse(event.body);

    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Query parameter is required' })
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

    // Step 1: Search for channels
    const channelSearchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=3&key=${YOUTUBE_API_KEY}`;
    const channelResponse = await fetch(channelSearchUrl);
    const channelData = await channelResponse.json();

    if (channelData.error) {
      throw new Error(channelData.error.message || 'Failed to search YouTube');
    }

    if (!channelData.items || channelData.items.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify([])
      };
    }

    // Step 2: Get playlists from top channels
    let allPlaylists = [];

    for (const channel of channelData.items.slice(0, 2)) {
      const channelId = channel.id.channelId;

      const playlistSearchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&type=playlist&maxResults=15&order=date&key=${YOUTUBE_API_KEY}`;
      const playlistResponse = await fetch(playlistSearchUrl);
      const playlistData = await playlistResponse.json();

      if (playlistData.items && playlistData.items.length > 0) {
        allPlaylists = allPlaylists.concat(playlistData.items);
      }
    }

    if (allPlaylists.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify([])
      };
    }

    // Step 3: Get detailed info for playlists
    const playlistIds = allPlaylists.map(item => item.id.playlistId).join(',');
    const detailsUrl = `${YOUTUBE_API_BASE}/playlists?part=snippet,contentDetails&id=${playlistIds}&key=${YOUTUBE_API_KEY}`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();

    // Sort by date
    const sortedPlaylists = (detailsData.items || []).sort((a, b) => {
      return new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt);
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(sortedPlaylists.slice(0, 10))
    };

  } catch (error) {
    console.error('YouTube search error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message || 'Failed to search YouTube'
      })
    };
  }
};
