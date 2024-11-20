const url = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&wantedCollections=app.bsky.feed.like";

const hashtagData = new Map();
let currentSortMode = 'uses';
let minUsesForAverage = 2;
let countUniqueUsersOnly = true;

class HashtagInfo {
    constructor() {
        this.totalCount = 0;     // Total number of uses
        this.totalLikes = 0;     
        this.posts = new Map();  
        this.users = new Set();  // Set of unique users
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

    addUse(userId) {
        this.totalCount++;
        this.users.add(userId);
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
    
    let sortedHashtags = Array.from(hashtagData.entries());

    if (currentSortMode === 'average') {
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
                case 'flop':
                    if (a[1].count < minUsesForAverage) return 1;
                    if (b[1].count < minUsesForAverage) return -1;
                    return b[1].flopScore - a[1].flopScore;
                default:
                    return b[1].count - a[1].count;
            }
        })
        .slice(0, 20);

    const html = sortedHashtags.map(([tag, data]) => `
        <div class="hashtag-item">
            <div>#${tag}</div>
            <div>${data.count}${countUniqueUsersOnly ? '' : ` (${data.users.size} users)`}</div>
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

    if (json.commit?.operation === 'create' && 
        json.commit?.collection === 'app.bsky.feed.post') {
        
        const facets = json.commit?.record?.facets || [];
        const postInfo = new PostInfo(json);
        
        facets.forEach(facet => {
            facet.features.forEach(feature => {
                if (feature.$type === 'app.bsky.richtext.facet#tag') {
                    const hashtag = feature.tag.toLowerCase();
                    
                    if (!hashtagData.has(hashtag)) {
                        hashtagData.set(hashtag, new HashtagInfo());
                    }
                    
                    const tagInfo = hashtagData.get(hashtag);
                    tagInfo.addUse(postInfo.did);
                    tagInfo.posts.set(postInfo.cid, postInfo);
                }
            });
        });
        
        updateHashtagList();
    }

    if (json.commit?.operation === 'create' && 
        json.commit?.collection === 'app.bsky.feed.like') {
        
        const likedPostCid = json.commit.record.subject.cid;
        
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

document.getElementById('sortSelect').addEventListener('change', (event) => {
    currentSortMode = event.target.value;
    const minUsesContainer = document.getElementById('minUsesContainer');
    minUsesContainer.classList.toggle('visible', 
        currentSortMode === 'average' || currentSortMode === 'flop');
    updateHashtagList();
});

document.getElementById('minUses').addEventListener('change', (event) => {
    minUsesForAverage = parseInt(event.target.value) || 2;
    if (currentSortMode === 'average' || currentSortMode === 'flop') {
        updateHashtagList();
    }
});

document.getElementById('uniqueUsers').addEventListener('change', (event) => {
    countUniqueUsersOnly = event.target.checked;
    updateHashtagList();
});

// Initial setup
document.getElementById('minUsesContainer').classList.toggle('visible', currentSortMode === 'average');
updateHashtagList();