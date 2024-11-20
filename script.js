const url = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&wantedCollections=app.bsky.feed.like";

const hashtagData = new Map();
let currentSortMode = 'uses';
let minUsesForAverage = 2;
let countUniqueUsersOnly = true;
let isSelecting = false;
let updatePending = false;
let lastUpdateTime = 0;
const UPDATE_THROTTLE = 1000; // Only update once per second
let forceUpdate = false;
const allPosts = new Map(); // Central storage for all posts
let isHovering = false;

class HashtagInfo {
    constructor() {
        this.totalCount = 0;     
        this.totalLikes = 0;     
        this.postIds = new Set();  // Store post IDs instead of post objects
        this.users = new Set();  
    }

    get count() {
        return countUniqueUsersOnly ? this.users.size : this.totalCount;
    }

    get averageLikes() {
        return this.count > 0 ? this.totalLikes / this.count : 0;
    }

    get flopScore() {
        if (this.totalLikes === 0) {
            return this.count * this.count;
        }
        return this.count * (this.count / this.totalLikes);
    }

    addUse(userId, postId) {
        this.totalCount++;
        this.users.add(userId);
        this.postIds.add(postId);
        
        // Update total likes based on existing post
        const post = allPosts.get(postId);
        if (post) {
            this.totalLikes = Array.from(this.postIds)
                .reduce((total, pid) => total + (allPosts.get(pid)?.likes || 0), 0);
        }
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
    if (isSelecting || isHovering) {
        updatePending = true;
        return;
    }
    
    // Only throttle for WebSocket updates, not for user-initiated changes
    const now = Date.now();
    if (!forceUpdate && now - lastUpdateTime < UPDATE_THROTTLE) {
        return;
    }
    lastUpdateTime = now;
    forceUpdate = false;  // Reset the force flag
    
    updatePending = false;

    const hashtagContent = document.getElementById('hashtag-content');
    
    let sortedHashtags = Array.from(hashtagData.entries());

    // Only apply min uses filter if not sorting by uses
    if (currentSortMode !== 'uses') {
        sortedHashtags = sortedHashtags.filter(([_, data]) => data.count >= minUsesForAverage);
    }

    sortedHashtags = sortedHashtags.sort((a, b) => {
            switch (currentSortMode) {
                case 'uses':
                    return b[1].count - a[1].count;
                case 'likes':
                    return b[1].totalLikes - a[1].totalLikes;
                case 'leastLikes':
                    return a[1].totalLikes - b[1].totalLikes;
                case 'average':
                    return b[1].averageLikes - a[1].averageLikes;
                case 'flop':
                    return b[1].flopScore - a[1].flopScore;
                default:
                    return b[1].count - a[1].count;
            }
        })
        .slice(0, 20);

    const html = sortedHashtags.map(([tag, data]) => `
        <div class="hashtag-item">
            <div class="hashtag-link-container">
                <a href="https://bsky.app/search?q=%23${encodeURIComponent(tag)}" 
                   target="_blank" 
                   class="hashtag-link" 
                   onclick="event.stopPropagation()">#${tag}</a>
            </div>
            <div>${data.count}${countUniqueUsersOnly ? '' : ` (${data.users.size} users)`}</div>
            <div>${data.totalLikes}</div>
            <div>${data.averageLikes.toFixed(2)}</div>
            <div>
                <button class="view-posts-btn" onclick="showPosts('${tag}')">View Posts</button>
            </div>
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

    if (json.commit?.operation === 'create' && 
        json.commit?.collection === 'app.bsky.feed.post') {
        
        const facets = json.commit?.record?.facets || [];
        const postInfo = new PostInfo(json);
        
        // Store post centrally first
        allPosts.set(postInfo.cid, postInfo);
        
        facets.forEach(facet => {
            facet.features.forEach(feature => {
                if (feature.$type === 'app.bsky.richtext.facet#tag') {
                    const hashtag = feature.tag.toLowerCase();
                    
                    if (!hashtagData.has(hashtag)) {
                        hashtagData.set(hashtag, new HashtagInfo());
                    }
                    
                    const tagInfo = hashtagData.get(hashtag);
                    tagInfo.addUse(postInfo.did, postInfo.cid);
                }
            });
        });
        
        updateHashtagList();
    }

    if (json.commit?.operation === 'create' && 
        json.commit?.collection === 'app.bsky.feed.like') {
        
        const likedPostCid = json.commit.record.subject.cid;
        const post = allPosts.get(likedPostCid);
        
        if (post) {
            post.likes++;
            
            // Update total likes for all affected hashtags
            hashtagData.forEach(tagInfo => {
                if (tagInfo.postIds.has(likedPostCid)) {
                    tagInfo.totalLikes = Array.from(tagInfo.postIds)
                        .reduce((total, pid) => total + (allPosts.get(pid)?.likes || 0), 0);
                }
            });
            
            updateHashtagList();
        }
    }
};

ws.onerror = (error) => {
    console.error("WebSocket error:", error);
};

ws.onclose = () => {
    console.log("WebSocket connection closed");
};

document.getElementById('sortSelect').addEventListener('change', (event) => {
    currentSortMode = event.target.value;
    
    // Enable/disable min uses input based on sort mode
    const minUsesInput = document.getElementById('minUses');
    const minUsesContainer = document.getElementById('minUsesContainer');
    
    if (currentSortMode === 'uses') {
        minUsesInput.disabled = true;
        minUsesContainer.style.opacity = '0.5';
    } else {
        minUsesInput.disabled = false;
        minUsesContainer.style.opacity = '1';
    }
    
    forceUpdate = true;
    updateHashtagList();
});

document.getElementById('minUses').addEventListener('change', (event) => {
    minUsesForAverage = parseInt(event.target.value) || 2;
    forceUpdate = true;  // Bypass throttle
    updateHashtagList();
});

document.getElementById('uniqueUsers').addEventListener('change', (event) => {
    countUniqueUsersOnly = event.target.checked;
    forceUpdate = true;  // Bypass throttle
    updateHashtagList();
});

document.getElementById('hashtag-list').addEventListener('mousedown', () => {
    isSelecting = true;
});

document.addEventListener('mouseup', () => {
    if (isSelecting) {
        isSelecting = false;
        if (updatePending) {
            updateHashtagList();
        }
    }
});

document.addEventListener('mouseleave', () => {
    if (isSelecting) {
        isSelecting = false;
        if (updatePending) {
            updateHashtagList();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Delegate hover events for dynamically created elements
    document.getElementById('hashtag-content').addEventListener('mouseenter', (event) => {
        if (event.target.matches('.view-posts-btn') || 
            event.target.matches('.hashtag-link')) {
            isHovering = true;
        }
    }, true);

    document.getElementById('hashtag-content').addEventListener('mouseleave', (event) => {
        if (event.target.matches('.view-posts-btn') || 
            event.target.matches('.hashtag-link')) {
            isHovering = false;
            if (updatePending) {
                updateHashtagList();
            }
        }
    }, true);
});

// Initial setup
updateHashtagList();

function showPosts(hashtag) {
    const tagInfo = hashtagData.get(hashtag.toLowerCase());
    if (!tagInfo) return;

    const modal = document.getElementById('postsModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');

    modalTitle.textContent = `#${hashtag} Posts`;
    
    const postsHtml = Array.from(tagInfo.postIds)
        .map(pid => allPosts.get(pid))
        .filter(post => post !== undefined)
        .sort((a, b) => b.likes - a.likes)
        .map(post => `
            <div class="post-item">
                <div>${post.text}</div>
                <div class="post-stats">
                    ❤️ ${post.likes} likes · 
                    <a href="${post.url}" target="_blank">View on Bluesky</a>
                </div>
            </div>
        `).join('');

    modalContent.innerHTML = postsHtml || 'No posts found';
    modal.style.display = 'block';
}

function closeModal() {
    const modal = document.getElementById('postsModal');
    modal.style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('postsModal');
    if (event.target === modal) {
        closeModal();
    }
}