const url = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&wantedCollections=app.bsky.feed.like";

// Enhanced data structure to store hashtag information
const hashtagData = new Map(); // Map<string, HashtagInfo>

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

// Add at the top with other constants
let likedHashtagsSortMode = 'total'; // 'total' or 'average'

// Function to update the hashtag displays
function updateHashtagDisplays() {
    updateRegularHashtagList();
    updateLikedHashtagList();
}

function updateRegularHashtagList() {
    const hashtagList = document.getElementById('hashtag-list');
    
    // Convert Map to array and sort by count
    const sortedHashtags = Array.from(hashtagData.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

    const html = sortedHashtags.map(([tag, data]) => `
        <div class="hashtag-item">
            <span>#${tag}</span>
            <span>${data.count}</span>
        </div>
    `).join('');

    hashtagList.innerHTML = html || 'Waiting for hashtags...';
}

function updateLikedHashtagList() {
    const likedList = document.getElementById('liked-hashtags');
    
    // Convert Map to array, filter out 0 likes, and sort based on selected mode
    const sortedByLikes = Array.from(hashtagData.entries())
        .filter(([_, data]) => data.totalLikes > 0)  // Only include hashtags with likes
        .sort((a, b) => {
            if (likedHashtagsSortMode === 'total') {
                return b[1].totalLikes - a[1].totalLikes;
            } else {
                return b[1].averageLikes - a[1].averageLikes;
            }
        })
        .slice(0, 10);

    const html = sortedByLikes.map(([tag, data]) => `
        <div class="hashtag-item">
            <span>#${tag}</span>
            <span>
                Total: ${data.totalLikes} | 
                Avg: ${data.averageLikes.toFixed(2)}
            </span>
        </div>
    `).join('');

    likedList.innerHTML = html || 'Waiting for liked hashtags...';
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
        
        updateHashtagDisplays();
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
                updateHashtagDisplays();
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

// Add after the WebSocket setup
document.getElementById('sortTotal').addEventListener('click', () => {
    likedHashtagsSortMode = 'total';
    document.getElementById('sortTotal').classList.add('active');
    document.getElementById('sortAverage').classList.remove('active');
    updateLikedHashtagList();
});

document.getElementById('sortAverage').addEventListener('click', () => {
    likedHashtagsSortMode = 'average';
    document.getElementById('sortAverage').classList.add('active');
    document.getElementById('sortTotal').classList.remove('active');
    updateLikedHashtagList();
});

// Initial display setup
updateHashtagDisplays();