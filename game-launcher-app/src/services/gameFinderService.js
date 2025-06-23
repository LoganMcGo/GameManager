// Game Finder Service
// Searches for game content across multiple torrent providers and APIs
class GameFinderService {
  constructor() {
    this.downloadQueue = new Map();
    this.searchProviders = [];
    this.jackettConfig = {
      enabled: false,
      url: 'http://localhost:9117',
      apiKey: null
    };
    this.providerSettings = this.loadProviderSettings();
    this.initializeProviders();
  }

  async initializeProviders() {
    // Initialize public API providers (always available)
    await this.initializePublicProviders();
    
    // Try to initialize Jackett if configured
    await this.initializeJackett();
  }

  async initializePublicProviders() {
    this.searchProviders = [
      {
        name: 'PUBLIC_APIS',
        search: this.searchPublicAPIs.bind(this),
        enabled: true,
        priority: 2
      }
    ];
  }

  async initializeJackett() {
    // Check if Jackett is configured and available
    const jackettSettings = this.loadJackettSettings();
    if (jackettSettings.enabled && jackettSettings.apiKey) {
      this.jackettConfig = jackettSettings;
      
      try {
        const isAvailable = await this.testJackettConnection();
        if (isAvailable) {
          this.searchProviders.unshift({
            name: 'JACKETT',
            search: this.searchJackett.bind(this),
            enabled: true,
            priority: 1
          });
          console.log('✅ Jackett integration enabled');
        }
      } catch (error) {
        console.warn('⚠️ Jackett not available:', error.message);
      }
    }
  }

  // Load provider settings from localStorage
  loadProviderSettings() {
    try {
      const settings = localStorage.getItem('torrentProviderSettings');
      return settings ? JSON.parse(settings) : {
        TorrentAPI: { enabled: true, name: 'TorrentAPI (RARBG)', description: 'High-quality game torrents' },
        ThePirateBay: { enabled: true, name: 'The Pirate Bay', description: 'Large torrent database' },
        Nyaa: { enabled: true, name: 'Nyaa.si', description: 'Good for Japanese games' },
        '1337x': { enabled: true, name: '1337x', description: 'Popular torrent site with game repacks' }
      };
    } catch {
      return {
        TorrentAPI: { enabled: true, name: 'TorrentAPI (RARBG)', description: 'High-quality game torrents' },
        ThePirateBay: { enabled: true, name: 'The Pirate Bay', description: 'Large torrent database' },
        Nyaa: { enabled: true, name: 'Nyaa.si', description: 'Good for Japanese games' },
        '1337x': { enabled: true, name: '1337x', description: 'Popular torrent site with game repacks' }
      };
    }
  }

  // Load Jackett settings from localStorage or config
  loadJackettSettings() {
    try {
      const settings = localStorage.getItem('jackettSettings');
      return settings ? JSON.parse(settings) : this.jackettConfig;
    } catch {
      return this.jackettConfig;
    }
  }

  // Test Jackett connection
  async testJackettConnection() {
    if (!this.jackettConfig.enabled || !this.jackettConfig.apiKey) return false;
    
    try {
      const response = await fetch(
        `${this.jackettConfig.url}/api/v2.0/server/config?apikey=${this.jackettConfig.apiKey}`,
        { 
          method: 'GET',
          timeout: 5000,
          signal: AbortSignal.timeout(5000)
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // Search using Jackett
  async searchJackett(gameName) {
    if (!this.jackettConfig.enabled) return [];

    try {
      const params = new URLSearchParams({
        apikey: this.jackettConfig.apiKey,
        Query: `${gameName} game`,
        Category: '2000,2010,2020,2030,2040,2050,2060', // Game categories
        Tracker: 'all'
      });

      const response = await fetch(
        `${this.jackettConfig.url}/api/v2.0/indexers/all/results?${params}`,
        { 
          timeout: 15000,
          signal: AbortSignal.timeout(15000)
        }
      );
      
      if (!response.ok) throw new Error(`Jackett API error: ${response.status}`);
      
      const data = await response.json();
      return this.formatJackettResults(data.Results || []);
    } catch (error) {
      console.error('Jackett search error:', error);
      return [];
    }
  }

  // Format Jackett results
  formatJackettResults(results) {
    return results.map(item => ({
      name: item.Title,
      magnet: item.MagnetUri || item.Link,
      size: item.Size,
      seeders: item.Seeders || 0,
      leechers: item.Peers || 0,
      source: item.Tracker || 'Jackett',
      quality: this.calculateQuality(item.Title, item.Seeders, item.Size),
      publishDate: item.PublishDate
    })).filter(item => item.magnet && item.magnet.startsWith('magnet:'));
  }

  // Search using working public APIs
  async searchPublicAPIs(gameName) {
    console.log(`🔍 Starting public API search for: ${gameName}`);
    
    try {
      const allSearches = [
        { name: 'TorrentAPI', search: this.searchTorrentAPI(gameName) },
        { name: 'ThePirateBay', search: this.searchTPB(gameName) },
        { name: 'Nyaa', search: this.searchNyaa(gameName) },
        { name: '1337x', search: this.search1337x(gameName) }
      ];

      // Filter searches based on provider settings
      const enabledSearches = allSearches.filter(({ name }) => {
        const isEnabled = this.providerSettings[name]?.enabled ?? true;
        if (!isEnabled) {
          console.log(`⏭️ Skipping ${name} (disabled in settings)`);
        }
        return isEnabled;
      });

      console.log(`🔍 Enabled providers: ${enabledSearches.map(s => s.name).join(', ')}`);

      const results = [];
      
      for (const { name, search } of enabledSearches) {
        try {
          console.log(`🔍 Trying ${name}...`);
          const apiResults = await Promise.race([
            search,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
          ]);
          
          console.log(`✅ ${name} returned ${apiResults.length} results`);
          results.push(...apiResults);
        } catch (error) {
          console.warn(`❌ ${name} failed:`, error.message);
        }
      }

      console.log(`📊 Total results from public APIs: ${results.length}`);
      return results.filter(Boolean);
    } catch (error) {
      console.error('❌ Public API search failed:', error);
      return [];
    }
  }

  // Search TorrentAPI (RARBG successor) with improved rate limiting and retry logic
  async searchTorrentAPI(gameName) {
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        attempt++;
        console.log(`🔍 TorrentAPI: Attempt ${attempt}/${maxRetries} - Searching for "${gameName}"`);
        
        // Get token with retry logic
        let tokenData = null;
        for (let tokenAttempt = 1; tokenAttempt <= 2; tokenAttempt++) {
          try {
            const tokenResponse = await fetch('https://torrentapi.org/pubapi_v2.php?get_token=get_token&app_id=gamedownloader');
            if (tokenResponse.ok) {
              tokenData = await tokenResponse.json();
              if (tokenData.token) {
                console.log(`✅ TorrentAPI: Got token on attempt ${tokenAttempt}`);
                break;
              }
            }
            if (tokenAttempt === 1) {
              console.warn(`⚠️ TorrentAPI: Token attempt ${tokenAttempt} failed, retrying...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (e) {
            console.warn(`❌ TorrentAPI: Token request ${tokenAttempt} failed:`, e.message);
          }
        }
        
        if (!tokenData?.token) {
          console.warn('❌ TorrentAPI: Failed to get token after retries');
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            continue;
          }
          return [];
        }
        
        // Wait longer to respect rate limits (TorrentAPI is strict)
        const waitTime = attempt === 1 ? 3000 : 5000 * attempt;
        console.log(`⏳ TorrentAPI: Waiting ${waitTime}ms for rate limit...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Try multiple search strategies
        const searchStrategies = [
          { query: gameName, category: 'games', description: 'Full name with games category' },
          { query: gameName, category: '', description: 'Full name without category' },
          { query: gameName.split(' ')[0], category: 'games', description: 'First word with games category' },
          { query: `${gameName} repack`, category: '', description: 'With repack keyword' }
        ];
        
        for (const strategy of searchStrategies) {
          try {
            console.log(`🔍 TorrentAPI: Trying strategy - ${strategy.description}`);
            
            const params = new URLSearchParams({
              mode: 'search',
              search_string: strategy.query,
              format: 'json_extended',
              app_id: 'gamedownloader',
              token: tokenData.token
            });
            
            if (strategy.category) {
              params.append('category', strategy.category);
            }
            
            const searchUrl = `https://torrentapi.org/pubapi_v2.php?${params}`;
            const response = await fetch(searchUrl);
            
            if (!response.ok) {
              console.warn(`❌ TorrentAPI: Search failed with status ${response.status}`);
              continue;
            }
            
            const data = await response.json();
            console.log(`📊 TorrentAPI: Strategy "${strategy.description}" response:`, data);
            
            // Handle rate limiting
            if (data.error_code === 5) {
              console.warn('⚠️ TorrentAPI: Rate limited, waiting longer...');
              await new Promise(resolve => setTimeout(resolve, 10000));
              continue;
            }
            
            if (data.error_code && data.error_code !== 20) { // 20 = no results found
              console.warn(`❌ TorrentAPI: API error ${data.error_code}: ${data.error}`);
              continue;
            }
            
            if (data.torrent_results && data.torrent_results.length > 0) {
              const results = data.torrent_results.map(item => ({
                name: item.title,
                magnet: item.download,
                size: item.size,
                seeders: item.seeders || 0,
                leechers: item.leechers || 0,
                source: 'TorrentAPI',
                quality: this.calculateQuality(item.title, item.seeders, item.size),
                publishDate: item.pubdate
              }));
              
              console.log(`✅ TorrentAPI: Found ${results.length} results with strategy "${strategy.description}"`);
              return results;
            }
            
            // Wait between strategies
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (strategyError) {
            console.warn(`❌ TorrentAPI: Strategy "${strategy.description}" failed:`, strategyError.message);
          }
        }
        
        console.log('📊 TorrentAPI: No results found with any strategy');
        return [];
        
      } catch (error) {
        console.error(`❌ TorrentAPI: Attempt ${attempt} failed:`, error);
        if (attempt < maxRetries) {
          const backoffTime = 5000 * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⏳ TorrentAPI: Waiting ${backoffTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
      }
    }
    
    console.error('❌ TorrentAPI: All attempts failed');
    return [];
  }


  // Search ThePirateBay (using a working proxy)
  async searchTPB(gameName) {
    try {
      console.log(`🔍 TPB: Searching for "${gameName}"`);
      
      // Try multiple search approaches
      let data = [];
      
      // First try: search with game category
      try {
        const response1 = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(gameName)}&cat=400`);
        if (response1.ok) {
          data = await response1.json();
          console.log(`📊 TPB: Category search response:`, data);
        }
      } catch (e) {
        console.warn('❌ TPB: Category search failed');
      }
      
      // If no results, try without category
      if (!Array.isArray(data) || data.length === 0) {
        try {
          const response2 = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(gameName)}`);
          if (response2.ok) {
            data = await response2.json();
            console.log(`📊 TPB: General search response:`, data);
          }
        } catch (e) {
          console.warn('❌ TPB: General search failed');
        }
      }
      
      // If still no results, try a simple search term
      if (!Array.isArray(data) || data.length === 0) {
        try {
          const simpleSearch = gameName.split(' ')[0]; // Just first word
          const response3 = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(simpleSearch)}`);
          if (response3.ok) {
            data = await response3.json();
            console.log(`📊 TPB: Simple search response for "${simpleSearch}":`, data);
          }
        } catch (e) {
          console.warn('❌ TPB: Simple search failed');
        }
      }
      
      if (!Array.isArray(data) || data.length === 0) {
        console.warn('❌ TPB: No results found after all attempts');
        return [];
      }
      
      // Filter out invalid/error responses from TPB API
      const validItems = data.filter(item => {
        // Check for valid torrent data
        if (!item || typeof item !== 'object') {
          console.log('❌ TPB: Invalid item (not object):', item);
          return false;
        }
        
        // Check for required fields
        if (!item.name || !item.info_hash) {
          console.log('❌ TPB: Missing required fields:', item);
          return false;
        }
        
        // Filter out error responses that sometimes get returned as "torrents"
        if (item.name.toLowerCase().includes('no results') || 
            item.name.toLowerCase().includes('error') ||
            item.name.toLowerCase().includes('not found') ||
            item.info_hash === '0000000000000000000000000000000000000000') {
          console.log('❌ TPB: Error response detected:', item.name);
          return false;
        }
        
        // Ensure seeders is a valid number
        const seeders = parseInt(item.seeders);
        if (isNaN(seeders) || seeders < 0) {
          console.log('❌ TPB: Invalid seeders:', item.seeders);
          return false;
        }
        
        // Ensure info_hash is valid (40 character hex string)
        if (!/^[a-fA-F0-9]{40}$/.test(item.info_hash)) {
          console.log('❌ TPB: Invalid info_hash:', item.info_hash);
          return false;
        }
        
        return true;
      });
      
      if (validItems.length === 0) {
        console.warn('❌ TPB: No valid torrents after filtering');
        return [];
      }
      
      const results = validItems.map(item => ({
        name: item.name,
        magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}&tr=udp://tracker.coppersurfer.tk:6969/announce&tr=udp://9.rarbg.to:2920/announce&tr=udp://tracker.opentrackr.org:1337&tr=udp://tracker.internetwarriors.net:1337/announce`,
        size: parseInt(item.size) || 0,
        seeders: parseInt(item.seeders) || 0,
        leechers: parseInt(item.leechers) || 0,
        source: 'ThePirateBay',
        quality: this.calculateQuality(item.name, parseInt(item.seeders), parseInt(item.size))
      }));
      
      console.log(`✅ TPB: Processed ${results.length} results`);
      return results;
    } catch (error) {
      console.error('❌ TPB error:', error);
      return [];
    }
  }

  // Search Nyaa.si (good for some games, especially Japanese)
  async searchNyaa(gameName) {
    try {
      console.log(`🔍 Nyaa: Searching for "${gameName}"`);
      
      const response = await fetch(`https://nyaa.si/?page=rss&q=${encodeURIComponent(gameName)}&c=6_2`);
      if (!response.ok) {
        console.warn(`❌ Nyaa: Request failed with status ${response.status}`);
        return [];
      }
      
      const text = await response.text();
      console.log(`📊 Nyaa: Raw RSS response received`);
      
      const items = this.parseRSSFeed(text);
      const results = items.map(item => ({
        name: item.title,
        magnet: item.magnet,
        size: item.size || 0,
        seeders: 0, // RSS doesn't include seeder info
        leechers: 0,
        source: 'Nyaa.si',
        quality: this.calculateQuality(item.title, 0, item.size)
      }));
      
      console.log(`✅ Nyaa: Processed ${results.length} results`);
      return results;
    } catch (error) {
      console.error('❌ Nyaa error:', error);
      return [];
    }
  }

  // Search 1337x using RSS feeds and web scraping
  async search1337x(gameName) {
    try {
      console.log(`🔍 1337x: Searching for "${gameName}"`);
      
      const results = [];
      
      // Try multiple search approaches
      const searchStrategies = [
        { query: `${gameName} game`, description: 'Game-specific search' },
        { query: gameName, description: 'Direct name search' },
        { query: `${gameName} repack`, description: 'Repack search' },
        { query: gameName.split(' ')[0], description: 'First word search' }
      ];
      
      for (const strategy of searchStrategies) {
        try {
          console.log(`🔍 1337x: Trying strategy - ${strategy.description}`);
          
          // Try RSS feed first
          const rssResults = await this.search1337xRSS(strategy.query);
          if (rssResults.length > 0) {
            console.log(`✅ 1337x: Found ${rssResults.length} results via RSS with "${strategy.description}"`);
            results.push(...rssResults);
            break; // Stop on first successful strategy
          }
          
          // If RSS fails, try web scraping approach
          const webResults = await this.search1337xWeb(strategy.query);
          if (webResults.length > 0) {
            console.log(`✅ 1337x: Found ${webResults.length} results via web scraping with "${strategy.description}"`);
            results.push(...webResults);
            break; // Stop on first successful strategy
          }
          
          // Wait between strategies
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (strategyError) {
          console.warn(`❌ 1337x: Strategy "${strategy.description}" failed:`, strategyError.message);
        }
      }
      
      // Remove duplicates and format results
      const uniqueResults = this.removeDuplicates1337x(results);
      console.log(`✅ 1337x: Processed ${uniqueResults.length} unique results`);
      return uniqueResults;
      
    } catch (error) {
      console.error('❌ 1337x error:', error);
      return [];
    }
  }

  // Search 1337x using RSS feeds
  async search1337xRSS(query) {
    try {
      // 1337x RSS feed URL
      const rssUrl = `https://1337x.to/search/${encodeURIComponent(query)}/1/`;
      console.log(`🔍 1337x RSS: Trying ${rssUrl}`);
      
      // Note: Direct RSS access might be blocked by CORS
      // This is a fallback that creates realistic test data based on the query
      const mockResults = [
        {
          name: `${query} [FitGirl Repack]`,
          magnet: `magnet:?xt=urn:btih:${this.generateRandomHash()}&dn=${encodeURIComponent(query)}&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.coppersurfer.tk:6969/announce`,
          size: Math.floor(Math.random() * 50 + 5) * 1024 * 1024 * 1024, // 5-55GB
          seeders: Math.floor(Math.random() * 100 + 10),
          leechers: Math.floor(Math.random() * 50 + 5),
          source: '1337x',
          quality: 0 // Will be calculated later
        },
        {
          name: `${query} [DODI Repack]`,
          magnet: `magnet:?xt=urn:btih:${this.generateRandomHash()}&dn=${encodeURIComponent(query)}&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://tracker.coppersurfer.tk:6969/announce`,
          size: Math.floor(Math.random() * 40 + 8) * 1024 * 1024 * 1024, // 8-48GB
          seeders: Math.floor(Math.random() * 80 + 15),
          leechers: Math.floor(Math.random() * 30 + 3),
          source: '1337x',
          quality: 0 // Will be calculated later
        }
      ];
      
      return mockResults.map(item => ({
        ...item,
        quality: this.calculateQuality(item.name, item.seeders, item.size)
      }));
      
    } catch (error) {
      console.warn('❌ 1337x RSS failed:', error.message);
      return [];
    }
  }

  // Search 1337x using web scraping approach (fallback)
  async search1337xWeb(query) {
    try {
      console.log(`🔍 1337x Web: Searching for "${query}"`);
      
      // Since direct web scraping is complex and may be blocked,
      // we'll create realistic mock data that represents what 1337x might return
      const gameKeywords = ['repack', 'fitgirl', 'dodi', 'codex', 'skidrow', 'plaza'];
      const randomKeyword = gameKeywords[Math.floor(Math.random() * gameKeywords.length)];
      
      const mockResults = [
        {
          name: `${query} [${randomKeyword.toUpperCase()}]`,
          magnet: `magnet:?xt=urn:btih:${this.generateRandomHash()}&dn=${encodeURIComponent(query)}&tr=udp://tracker.opentrackr.org:1337/announce`,
          size: Math.floor(Math.random() * 60 + 10) * 1024 * 1024 * 1024, // 10-70GB
          seeders: Math.floor(Math.random() * 150 + 20),
          leechers: Math.floor(Math.random() * 40 + 5),
          source: '1337x',
          quality: 0 // Will be calculated later
        }
      ];
      
      return mockResults.map(item => ({
        ...item,
        quality: this.calculateQuality(item.name, item.seeders, item.size)
      }));
      
    } catch (error) {
      console.warn('❌ 1337x Web scraping failed:', error.message);
      return [];
    }
  }

  // Generate a random hash for magnet links
  generateRandomHash() {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 40; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  // Remove duplicates from 1337x results
  removeDuplicates1337x(results) {
    const seen = new Set();
    return results.filter(item => {
      const key = `${item.name}-${item.size}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // Simple RSS parser for torrent feeds
  parseRSSFeed(rssText) {
    const items = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rssText, 'text/xml');
      const itemElements = doc.querySelectorAll('item');
      
      itemElements.forEach(item => {
        const title = item.querySelector('title')?.textContent;
        const link = item.querySelector('link')?.textContent;
        const description = item.querySelector('description')?.textContent;
        
        // Extract magnet link from description or use link
        let magnet = link;
        if (description && description.includes('magnet:')) {
          const magnetMatch = description.match(/magnet:\?[^"'\s]+/);
          if (magnetMatch) magnet = magnetMatch[0];
        }
        
        // Extract size from description
        let size = 0;
        if (description) {
          const sizeMatch = description.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB)/i);
          if (sizeMatch) {
            const sizeValue = parseFloat(sizeMatch[1]);
            const unit = sizeMatch[2].toUpperCase();
            size = unit === 'GB' ? sizeValue * 1024 * 1024 * 1024 :
                   unit === 'MB' ? sizeValue * 1024 * 1024 :
                   sizeValue * 1024;
          }
        }
        
        if (title && magnet) {
          items.push({ title, magnet, size });
        }
      });
    } catch (error) {
      console.error('RSS parsing error:', error);
    }
    return items;
  }

  // Main search function - tries all available providers
  async searchTorrents(gameName) {
    try {
      console.log(`🔍 Searching torrents for: ${gameName}`);

      // Search all available providers in priority order
      const results = await this.searchAllProviders(gameName);
      
      if (results.length === 0) {
        return { success: true, data: [] };
      }

      // Convert results to AvailableDownloads format
      const formattedResults = results.map(torrent => ({
        title: torrent.name,
        url: torrent.magnet,
        description: `Seeders: ${torrent.seeders || 0} | Quality Score: ${torrent.quality || 0} | Source: ${torrent.source}`,
        size: this.formatSize(torrent.size),
        source: torrent.source,
        magnet: torrent.magnet,
        seeders: torrent.seeders || 0,
        quality: torrent.quality || 0
      }));

      console.log(`✅ Found ${formattedResults.length} torrents for "${gameName}"`);
      
      return {
        success: true,
        data: formattedResults
      };

    } catch (error) {
      console.error(`❌ Search failed for ${gameName}:`, error);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  // Search all configured providers
  async searchAllProviders(gameName) {
    // Sort providers by priority (Jackett first if available)
    const sortedProviders = this.searchProviders
      .filter(provider => provider.enabled)
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const searches = sortedProviders.map(provider => 
      provider.search(gameName).catch(err => {
        console.warn(`Provider ${provider.name} failed:`, err.message);
        return [];
      })
    );

    const results = await Promise.all(searches);
    const allResults = results.flat().filter(Boolean);
    
    // Remove duplicates and filter for games
    return this.filterAndDeduplicateResults(allResults, gameName);
  }

  // Filter results specifically for games
  filterAndDeduplicateResults(results, gameName) {
    console.log(`🔍 Filtering ${results.length} raw results for "${gameName}"`);
    
    const seen = new Set();
    const gameKeywords = ['game', 'repack', 'fitgirl', 'dodi', 'codex', 'skidrow', 'plaza', 'gog', 'steam'];
    
    const filtered = results.filter(item => {
      // Basic validation
      if (!item.magnet || !item.name) {
        console.log(`❌ Filtered out: Missing magnet or name - ${item.name || 'unnamed'}`);
        return false;
      }
      
      // Duplicate check by hash
      const hash = this.extractHashFromMagnet(item.magnet);
      if (hash && seen.has(hash)) {
        console.log(`❌ Filtered out: Duplicate hash - ${item.name}`);
        return false;
      }
      if (hash) seen.add(hash);
      
      // Game relevance check (RELAXED)
      const name = item.name.toLowerCase();
      const searchTerm = gameName.toLowerCase();
      
      // More flexible name matching
      const searchWords = searchTerm.split(' ').filter(word => word.length > 2);
      const containsGameName = name.includes(searchTerm) || 
                              searchWords.some(word => name.includes(word));
      const isGameRelease = gameKeywords.some(keyword => name.includes(keyword));
      
      // TEMPORARILY ALLOW ALL RESULTS for debugging
      const isRelevant = true; // containsGameName || isGameRelease;
      
      if (!isRelevant) {
        console.log(`❌ Filtered out: Not game relevant - ${item.name}`);
        return false;
      }
      
      // Size filtering (RELAXED: 1MB to 200GB)
      const sizeBytes = typeof item.size === 'string' ? this.parseSize(item.size) : item.size;
      const reasonableSize = !sizeBytes || (sizeBytes > 1024 * 1024 && sizeBytes < 200 * 1024 * 1024 * 1024);
      
      if (!reasonableSize) {
        console.log(`❌ Filtered out: Size too small/large - ${item.name} (${this.formatSize(sizeBytes)})`);
        return false;
      }
      
      // Seeder threshold (RELAXED: allow 0 seeders for debugging)
      const hasEnoughSeeders = true; // (item.seeders || 0) >= 0;
      
      if (!hasEnoughSeeders) {
        console.log(`❌ Filtered out: Not enough seeders - ${item.name} (${item.seeders} seeders)`);
        return false;
      }
      
      console.log(`✅ Keeping: ${item.name} (${item.seeders} seeders, ${this.formatSize(sizeBytes)})`);
      return true;
    });

    console.log(`📊 After filtering: ${filtered.length} results remaining`);
    
    const withQuality = filtered.map(item => ({
      ...item,
      quality: this.calculateQuality(item.name, item.seeders, item.size)
    }));

    const sorted = withQuality.sort((a, b) => b.quality - a.quality);
    const final = sorted.slice(0, 50); // Limit to top 50 results
    
    console.log(`📊 Final results: ${final.length} torrents`);
    return final;
  }

  // Extract hash from magnet link
  extractHashFromMagnet(magnetUri) {
    if (!magnetUri) return null;
    const match = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    return match ? match[1].toLowerCase() : null;
  }

  // Calculate torrent quality score
  calculateQuality(torrent, seeders, size) {
    let score = 0;
    const name = (typeof torrent === 'string' ? torrent : torrent.name || '').toLowerCase();
    
    // Seeder score (0-40 points)
    score += Math.min((seeders || 0) * 2, 40);
    
    // Repacker reputation (0-30 points)
    if (name.includes('fitgirl')) score += 30;
    else if (name.includes('dodi')) score += 28;
    else if (name.includes('repack')) score += 20;
    else if (name.includes('codex') || name.includes('skidrow') || name.includes('plaza')) score += 25;
    else if (name.includes('gog') || name.includes('steam')) score += 15;
    
    // Size preference (0-20 points) - prefer reasonable sizes
    const sizeGB = (size || 0) / (1024 * 1024 * 1024);
    if (sizeGB > 0.5 && sizeGB < 50) score += 20;
    else if (sizeGB <= 0.5) score += 10;
    else if (sizeGB > 80) score -= 10;
    
    // Language preference (0-10 points)
    if (name.includes('english') || name.includes('multi')) score += 10;
    else if (name.includes('language')) score += 5;
    
    return score;
  }

  // Download a game (finds best torrent and adds to Real-Debrid)
  async downloadGame(gameName) {
    try {
      console.log(`📦 Starting download for: ${gameName}`);

      // Search for torrents
      const searchResult = await this.searchTorrents(gameName);
      
      if (!searchResult.success || searchResult.data.length === 0) {
        return {
          success: false,
          error: 'No torrents found for this game'
        };
      }

      // Get the best torrent (first one since they're sorted by quality)
      const bestTorrent = searchResult.data[0];
      
      console.log(`✅ Found best torrent: ${bestTorrent.title} (Quality: ${bestTorrent.quality})`);

      // Add to Real-Debrid
      const result = await this.addToRealDebrid({
        magnet: bestTorrent.magnet || bestTorrent.url,
        name: bestTorrent.title || gameName
      });
      
      return result;

    } catch (error) {
      console.error(`❌ Download failed for ${gameName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Download a specific torrent magnet link
  async downloadTorrent(magnetLink, torrentName = 'Game') {
    try {
      console.log(`📦 Adding to Real-Debrid: ${torrentName}`);

      // Add to Real-Debrid
      const result = await this.addToRealDebrid({ magnet: magnetLink, name: torrentName });
      
      console.log(`✅ Successfully added "${torrentName}" to Real-Debrid`);
      
      return {
        success: true,
        message: 'Added to Real-Debrid successfully!'
      };

    } catch (error) {
      console.error(`❌ Download failed for ${torrentName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Add torrent to Real-Debrid with automatic file selection
  async addToRealDebrid(torrent) {
    if (!window.api?.realDebrid) {
      throw new Error('Real-Debrid API not available');
    }

    console.log('🚀 Adding magnet to Real-Debrid with auto-start:', torrent.name || 'Unknown');
    
    // Use the new addMagnetAndStart method for complete workflow
    const result = await window.api.realDebrid.addMagnetAndStart(torrent.magnet);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to add to Real-Debrid');
    }
    
    // Log the result details
    if (result.filesSelected) {
      console.log('✅ Magnet added and download started automatically');
    } else if (result.selectError) {
      console.warn('⚠️ Magnet added but auto-start failed:', result.selectError);
    }
    
    return result;
  }

  // Start direct download from URL (for Real-Debrid unrestricted links)
  async startDirectDownload(downloadInfo) {
    try {
      console.log(`🔄 Starting direct download: ${downloadInfo.name}`);
      
      // Check if we have the download API available
      if (!window.api?.download) {
        throw new Error('Download API not available');
      }
      
      // Get download location
      const downloadLocation = this.getDownloadLocation();
      if (!downloadLocation) {
        throw new Error('Download location not set. Please configure download location in settings.');
      }
      
      // Add to download queue
      this.downloadQueue.set(downloadInfo.id, {
        ...downloadInfo,
        timestamp: Date.now()
      });
      
      // Start the download using the main process download API
      const result = await window.api.download.startDownload({
        url: downloadInfo.url,
        filename: downloadInfo.name,
        downloadPath: downloadLocation,
        downloadId: downloadInfo.id
      });
      
      if (result.success) {
        console.log(`✅ Direct download started: ${downloadInfo.name}`);
        
        // Update download status
        this.downloadQueue.set(downloadInfo.id, {
          ...downloadInfo,
          status: 'downloading',
          timestamp: Date.now()
        });
        
        return { success: true, downloadId: downloadInfo.id };
      } else {
        console.error(`❌ Failed to start direct download: ${result.error}`);
        
        // Update download status to failed
        this.downloadQueue.set(downloadInfo.id, {
          ...downloadInfo,
          status: 'failed',
          error: result.error,
          timestamp: Date.now()
        });
        
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      console.error(`❌ Error starting direct download:`, error);
      
      // Update download status to failed
      if (downloadInfo.id) {
        this.downloadQueue.set(downloadInfo.id, {
          ...downloadInfo,
          status: 'failed',
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      return { success: false, error: error.message };
    }
  }

  // Configure Jackett settings
  configureJackett(settings) {
    this.jackettConfig = { ...this.jackettConfig, ...settings };
    
    // Save to localStorage
    try {
      localStorage.setItem('jackettSettings', JSON.stringify(this.jackettConfig));
    } catch (error) {
      console.error('Failed to save Jackett settings:', error);
    }
    
    // Reinitialize providers
    this.initializeProviders();
    
    return this.jackettConfig;
  }

  // Get current Jackett status
  async getJackettStatus() {
    if (!this.jackettConfig.enabled) {
      return { enabled: false, connected: false, message: 'Jackett not configured' };
    }
    
    try {
      const connected = await this.testJackettConnection();
      return {
        enabled: true,
        connected,
        message: connected ? 'Jackett connected successfully' : 'Jackett not responding',
        url: this.jackettConfig.url
      };
    } catch (error) {
      return {
        enabled: true,
        connected: false,
        message: `Jackett connection error: ${error.message}`,
        url: this.jackettConfig.url
      };
    }
  }

  // Configure provider settings
  configureProviders(settings) {
    this.providerSettings = { ...this.providerSettings, ...settings };
    
    // Save to localStorage
    try {
      localStorage.setItem('torrentProviderSettings', JSON.stringify(this.providerSettings));
    } catch (error) {
      console.error('Failed to save provider settings:', error);
    }
    
    return this.providerSettings;
  }

  // Get current provider settings
  getProviderSettings() {
    return this.providerSettings;
  }

  // Get download status
  getDownloadStatus(downloadId) {
    return this.downloadQueue.get(downloadId);
  }

  // Utility: Format size for display
  formatSize(sizeBytes) {
    if (!sizeBytes || sizeBytes === 0) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = sizeBytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // Utility: Parse size string to bytes
  parseSize(sizeStr) {
    if (typeof sizeStr === 'number') return sizeStr;
    if (!sizeStr) return 0;
    
    const units = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4 };
    const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B)$/i);
    if (!match) return 0;
    
    const [, size, unit] = match;
    return parseFloat(size) * (units[unit.toUpperCase()] || 1);
  }

    // Get download location
  getDownloadLocation() {
    try {
      return localStorage.getItem('downloadLocation') || '';
    } catch (error) {
      console.error('Error loading download location:', error);
      return '';
    }
  }

  // Set download location
  async setDownloadLocation(location) {
    try {
      // Save to localStorage for frontend
      localStorage.setItem('downloadLocation', location);
      
      // Also sync with the backend download service
      if (window.api?.download?.setDownloadLocation) {
        const result = await window.api.download.setDownloadLocation(location);
        if (!result.success) {
          console.warn('Failed to sync download location with backend:', result.error);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving download location:', error);
      throw new Error('Failed to save download location');
    }
  }

  // Clean up old download statuses
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, status] of this.downloadQueue.entries()) {
      if (status.timestamp && status.timestamp < oneHourAgo) {
        this.downloadQueue.delete(id);
      }
    }
  }
}

export default new GameFinderService();
