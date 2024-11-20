const url = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&wantedCollections=app.bsky.feed.like";

// Enhanced data structure to store hashtag information
const hashtagData = new Map(); // Map<string, HashtagInfo>
let currentSortMode = 'uses'; // 'uses', 'likes', or 'average'
let minUsesForAverage = 2;

// Helper class to store hashtag information
class HashtagInfo {
    constructor() {
        this.count = 0;          // Number of posts using this hashtag
        this.totalLikes = 0;     // Total likes on posts with this hashtag
        this.posts = new Map();  // Map<cid, PostInfo>
    }

    get averageLikes() {
        return this.count > 0 ? this.totalLikes / this.count : 0;
    }
}

class PostInfo {
    constructor(json) {
        this.cid = json.commit.cid;
        this.rkey = json.commit.rkey;
        this.did = json.did;
        this.text = json.commit.record.text;
        this.likes = 0;
        this.url = `https://bsky.app/profile/${json.did}/post/${json.commit.rkey}`;
    }
}

function updateHashtagList() {
    const hashtagContent = document.getElementById('hashtag-content');
    
    // Convert Map to array and sort based on selected mode
    let sortedHashtags = Array.from(hashtagData.entries());

    if (currentSortMode === 'average') {
        // Filter by minimum uses when sorting by average
        sortedHashtags = sortedHashtags.filter(([_, data]) => data.count >= minUsesForAverage);
    }

    sortedHashtags = sortedHashtags.sort((a, b) => {
            switch (currentSortMode) {
                case 'uses':
                    return b[1].count - a[1].count;
                case 'likes':
                    return b[1].totalLikes - a[1].totalLikes;
                case 'average':
                    return b[1].averageLikes - a[1].averageLikes;
                default:
                    return b[1].count - a[1].count;
            }
        })
        .slice(0, 20); // Increased to 20

    const html = sortedHashtags.map(([tag, data]) => `
        <div class="hashtag-item">
            <div>#${tag}</div>
            <div>${data.count}</div>
            <div>${data.totalLikes}</div>
            <div>${data.averageLikes.toFixed(2)}</div>
        </div>
    `).join('');

    hashtagContent.innerHTML = html || 'Waiting for hashtags...';
}

const ws = new WebSocket(url);

ws.onopen = () => {
    console.log("Connected to Bluesky WebSocket");
};

ws.onmessage = (event) => {
    const json = JSON.parse(event.data);

    // Handle new posts
    if (json.commit?.operation === 'create' && 
        json.commit?.collection === 'app.bsky.feed.post') {
        
        const facets = json.commit?.record?.facets || [];
        const postInfo = new PostInfo(json);
        
        // Process hashtags in the post
        facets.forEach(facet => {
            facet.features.forEach(feature => {
                if (feature.$type === 'app.bsky.richtext.facet#tag') {
                    const hashtag = feature.tag.toLowerCase();
                    
                    // Initialize hashtag data if needed
                    if (!hashtagData.has(hashtag)) {
                        hashtagData.set(hashtag, new HashtagInfo());
                    }
                    
                    // Update hashtag information
                    const tagInfo = hashtagData.get(hashtag);
                    tagInfo.count++;
                    tagInfo.posts.set(postInfo.cid, postInfo);
                }
            });
        });
        
        updateHashtagList();
    }

    // Handle likes
    if (json.commit?.operation === 'create' && 
        json.commit?.collection === 'app.bsky.feed.like') {
        
        const likedPostCid = json.commit.record.subject.cid;
        
        // Update likes count for all hashtags that were in the liked post
        hashtagData.forEach(tagInfo => {
            if (tagInfo.posts.has(likedPostCid)) {
                const post = tagInfo.posts.get(likedPostCid);
                post.likes++;
                tagInfo.totalLikes++;
                updateHashtagList();
            }
        });
    }
};

ws.onerror = (error) => {
    console.error("WebSocket error:", error);
};

ws.onclose = () => {
    console.log("WebSocket connection closed");
};

// Add event listener for sort selection
document.getElementById('sortSelect').addEventListener('change', (event) => {
    currentSortMode = event.target.value;
    // Show/hide min uses input based on sort mode
    const minUsesContainer = document.getElementById('minUsesContainer');
    minUsesContainer.classList.toggle('visible', currentSortMode === 'average');
    updateHashtagList();
});

// Add event listener for minimum uses input
document.getElementById('minUses').addEventListener('change', (event) => {
    minUsesForAverage = parseInt(event.target.value) || 2;
    if (currentSortMode === 'average') {
        updateHashtagList();
    }
});

// Initial setup
document.getElementById('minUsesContainer').classList.toggle('visible', currentSortMode === 'average');
updateHashtagList();