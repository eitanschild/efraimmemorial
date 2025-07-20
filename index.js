const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const videosFile = path.join(__dirname, 'videos.json');
const ktavimFile = path.join(__dirname, 'ktavim.json');
const memoriesFile = path.join(__dirname, 'approvedMemories.json');
const app = express();


app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'https://www.ephraimjackman.com',
      'https://efraimmemorial-frontend.vercel.app',
      'http://localhost:3000',
      'https://efraimemorial-production.up.railway.app'  // ✅ this was missing
    ];
    

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('❌ Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});


app.use(bodyParser.json());

app.post('/api/memories', async (req, res) => {
  const { name, message } = req.body;

  if (!name || !message) {
    return res.status(400).json({ error: 'Missing name or message' });
  }

  try {
    await pool.query(
      'INSERT INTO memories (name, message, created_at, approved) VALUES ($1, $2, CURRENT_DATE, false)',
      [name, message]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error inserting memory:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/memories/approved', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, message, created_at FROM memories WHERE approved = true ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching approved memories:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/api/memories/pending', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, message, created_at FROM memories WHERE approved = false ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pending memories:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/memories/approve/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10); // 💥 Cast here

  try {
    await pool.query('UPDATE memories SET approved = true WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error approving memory:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/memories/delete/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10); // 💥 Cast here

  try {
    await pool.query('DELETE FROM memories WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting memory:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.set('trust proxy', 1); // trust Railway's proxy
app.use(session({
  secret: process.env.SESSION_SECRET || 'keyboard-cat',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,           // must be true in production
    sameSite: 'None',       // needed for cross-site cookie
    maxAge: 1000 * 60 * 60
  }
}));





// Password Protection
app.post('/auth', (req, res) => {
  const { username, password } = req.body;

  console.log('username:', username);
  console.log('password:', password);
  console.log('expected:', process.env.ADMIN_PASSWORD);

  if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
    req.session.regenerate((err) => {
      if (err) {
        console.error('❌ Session regeneration error:', err);
        return res.sendStatus(500);
      }

      req.session.admin = true;

      req.session.save((err) => {
        if (err) {
          console.error('❌ Failed to save session:', err);
          return res.sendStatus(500);
        }

        console.log('✅ Logged in, session:', req.session);
        res.sendStatus(200);
      });
    });
  } else {
    res.sendStatus(401);
  }
});


// GET all approved videos
app.get('/api/videos', (req, res) => {
  const data = fs.existsSync(videosFile) ? JSON.parse(fs.readFileSync(videosFile)) : [];
  res.json(data);
});

// POST a new video (admin only)
app.post('/api/videos', (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { title, youtubeId, section } = req.body;

  if (!title || !youtubeId || !section) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  let data = fs.existsSync(videosFile) ? JSON.parse(fs.readFileSync(videosFile)) : [];

  data.push({ title, youtubeId, section });
  fs.writeFileSync(videosFile, JSON.stringify(data, null, 2));
  res.json({ success: true });
});




app.get('/admin.html', (req, res) => {
  console.log('🧠 SESSION CHECK (/admin.html):', req.session);

  if (!req.session || !req.session.admin) {
    return res.status(403).send('גישה נדחתה');
  }

  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout failed:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }

    res.clearCookie('connect.sid', {
      path: '/',
      secure: true, // match session config
      sameSite: 'None' // match session config
    });

    res.sendStatus(200);
  });
});


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// You no longer use these folders, but if still present:
app.use('/pending-gallery', express.static(path.join(__dirname, 'pending-gallery')));
app.use('/gallery', express.static(path.join(__dirname, 'gallery')));

// Multer for temp uploads
const multer = require('multer');
const upload = multer({ dest: 'temp_uploads/' });

// Cloudinary config with validation
const cloudinary = require('cloudinary').v2;

if (
  !process.env.CLOUDINARY_CLOUD_NAME ||
  !process.env.CLOUDINARY_API_KEY ||
  !process.env.CLOUDINARY_API_SECRET
) {
  console.error('❌ Missing Cloudinary environment variables');
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Gallery upload route with 5MB limit
app.post('/api/gallery', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (file.size > 5 * 1024 * 1024) {
      fs.unlinkSync(file.path); // delete oversized temp file
      return res.status(400).json({ error: 'Image too large. Max 5MB allowed.' });
    }

    const caption = req.body.caption || '';
    const uploader = req.body.uploader || 'לא ידוע';

    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'efraim-gallery',
      use_filename: true
    });

    fs.unlinkSync(file.path); // delete temp file after upload

    const pendingPath = path.join(__dirname, 'pending-gallery.json');
    const pending = fs.existsSync(pendingPath)
      ? JSON.parse(fs.readFileSync(pendingPath, 'utf-8'))
      : [];

    pending.push({
      url: result.secure_url,
      public_id: result.public_id,
      caption,
      uploader
    });

    fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
    res.status(200).json({ message: 'Uploaded and pending approval.' });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Image upload failed.' });
  }
});

app.post('/api/memories', (req, res) => {
  const memory = req.body;
  const current = JSON.parse(fs.readFileSync(pendingFile));
  current.push(memory);
  fs.writeFileSync(pendingFile, JSON.stringify(current, null, 2));
  res.status(200).json({ message: 'Memory submitted and pending approval' });
});

app.get('/api/pending', (req, res) => {
  const data = JSON.parse(fs.readFileSync(pendingFile));
  res.json(data);
});

app.post('/api/approve/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const pending = JSON.parse(fs.readFileSync(pendingFile));
  const approved = JSON.parse(fs.readFileSync(approvedFile));

  if (index >= 0 && index < pending.length) {
    const memory = pending.splice(index, 1)[0];
    approved.push(memory);
    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
    fs.writeFileSync(approvedFile, JSON.stringify(approved, null, 2));
    res.status(200).json({ message: 'Memory approved' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});

app.get('/api/memories', (req, res) => {
  const data = JSON.parse(fs.readFileSync(approvedFile));
  res.json(data);
});

const PORT = process.env.PORT || 3001;

app.get('/api/memories/approved', (req, res) => {
  const data = JSON.parse(fs.readFileSync(approvedFile));
  res.json(data);
});



app.post('/api/ktavim/approve/:index', (req, res) => {
  const data = JSON.parse(fs.readFileSync(ktavimFile));
  const idx = parseInt(req.params.index);
  if (data[idx]) {
    data[idx].approved = true;
    fs.writeFileSync(ktavimFile, JSON.stringify(data, null, 2));
    res.sendStatus(200);
  } else {
    res.status(404).send('Not found');
  }
});

const axios = require('axios');

app.get('/api/cloudinary/usage', async (req, res) => {
  try {
    const result = await axios.get(
      `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/usage`,
      {
        auth: {
          username: process.env.CLOUDINARY_API_KEY,
          password: process.env.CLOUDINARY_API_SECRET
        }
      }
    );
    res.json(result.data);
  } catch (err) {
    console.error('Cloudinary usage error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

app.post('/api/videos/delete/:index', (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!fs.existsSync(videosFile)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const index = parseInt(req.params.index);
  const data = JSON.parse(fs.readFileSync(videosFile));

  if (index < 0 || index >= data.length) {
    return res.status(400).json({ error: 'Invalid index' });
  }

  data.splice(index, 1);
  fs.writeFileSync(videosFile, JSON.stringify(data, null, 2));
  res.json({ message: 'Video deleted' });
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Edit a pending memory by index
app.post('/api/edit/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const { name, message } = req.body;
  const pending = JSON.parse(fs.readFileSync(pendingFile));

  if (index >= 0 && index < pending.length) {
    pending[index] = { name, message };
    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
    res.status(200).json({ message: 'Memory updated' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});

// Delete a pending memory by index
app.post('/api/delete/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const pending = JSON.parse(fs.readFileSync(pendingFile));

  if (index >= 0 && index < pending.length) {
    pending.splice(index, 1);
    fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
    res.status(200).json({ message: 'Memory deleted' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});


// Delete approved memory by index
app.post('/api/delete-approved/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const approved = JSON.parse(fs.readFileSync(approvedFile));

  if (index >= 0 && index < approved.length) {
    approved.splice(index, 1);
    fs.writeFileSync(approvedFile, JSON.stringify(approved, null, 2));
    res.status(200).json({ message: 'Approved memory deleted' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});


// Get pending gallery items
app.get('/api/gallery/pending', (req, res) => {
  const pending = JSON.parse(fs.readFileSync(path.join(__dirname, 'pending-gallery.json')));
  res.json(pending);
});

// Get approved gallery items
app.get('/api/gallery/approved', (req, res) => {
  const approved = JSON.parse(fs.readFileSync(path.join(__dirname, 'gallery.json')));
  res.json(approved);
});

// Approve gallery image
app.post('/api/gallery/approve/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const pendingPath = path.join(__dirname, 'pending-gallery.json');
  const approvedPath = path.join(__dirname, 'gallery.json');

  const pendingList = JSON.parse(fs.readFileSync(pendingPath));
  const approvedList = fs.existsSync(approvedPath)
    ? JSON.parse(fs.readFileSync(approvedPath))
    : [];

  if (index >= 0 && index < pendingList.length) {
    const item = pendingList.splice(index, 1)[0];
    approvedList.push(item);

    fs.writeFileSync(pendingPath, JSON.stringify(pendingList, null, 2));
    fs.writeFileSync(approvedPath, JSON.stringify(approvedList, null, 2));
    res.status(200).json({ message: 'Gallery item approved' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});

  //Delete Pending Gallery Item
app.post('/api/gallery/delete/:index', async (req, res) => {
  const index = parseInt(req.params.index);
  const pendingPath = path.join(__dirname, 'pending-gallery.json');
  const pendingList = fs.existsSync(pendingPath)
    ? JSON.parse(fs.readFileSync(pendingPath, 'utf-8'))
    : [];

  if (index >= 0 && index < pendingList.length) {
    const item = pendingList.splice(index, 1)[0];

    // Delete from Cloudinary if public_id exists
    if (item.public_id) {
      try {
        await cloudinary.uploader.destroy(item.public_id);
      } catch (err) {
        console.error('Cloudinary delete failed (pending):', err.message);
      }
    }

    // Delete local file if legacy item
    if (item.filename) {
      const filePath = path.join(__dirname, 'pending-gallery', item.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    fs.writeFileSync(pendingPath, JSON.stringify(pendingList, null, 2));
    res.status(200).json({ message: 'Pending gallery item deleted' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});


// Delete approved gallery item
app.post('/api/gallery/delete-approved/:index', async (req, res) => {
  const index = parseInt(req.params.index);
  const approvedPath = path.join(__dirname, 'gallery.json');
  const approvedList = fs.existsSync(approvedPath)
    ? JSON.parse(fs.readFileSync(approvedPath, 'utf-8'))
    : [];

  if (index >= 0 && index < approvedList.length) {
    const item = approvedList.splice(index, 1)[0];

    // Delete from Cloudinary if applicable
    if (item.public_id) {
      try {
        await cloudinary.uploader.destroy(item.public_id);
      } catch (err) {
        console.error('Cloudinary delete failed (approved):', err.message);
      }
    }

    // Delete local file if legacy
    if (item.filename) {
      const filePath = path.join(__dirname, 'gallery', item.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    fs.writeFileSync(approvedPath, JSON.stringify(approvedList, null, 2));
    res.status(200).json({ message: 'Approved gallery item deleted' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ ktavim: [], memories: [], videos: [] });

  // Load all data
  const ktavim = fs.existsSync(ktavimFile) ? JSON.parse(fs.readFileSync(ktavimFile)) : [];
  const memories = fs.existsSync(memoriesFile) ? JSON.parse(fs.readFileSync(memoriesFile)) : [];
  const videos = fs.existsSync(videosFile) ? JSON.parse(fs.readFileSync(videosFile)) : [];

  const filterText = (text) => text.toLowerCase().includes(q);

  const ktavMatches = ktavim.filter(k => filterText(k.title) || filterText(k.content));
  const memoryMatches = memories.filter(m => filterText(m.name || '') || filterText(m.message || ''));
  const videoMatches = videos.filter(v => filterText(v.title || ''));

  res.json({
    ktavim: ktavMatches,
    memories: memoryMatches,
    videos: videoMatches
  });
});




// --- כתבי אפרים Routes ---

app.get('/api/ktavim', (req, res) => {
  if (!fs.existsSync(ktavimFile)) {
    return res.json([]);
  }

  try {
    const data = JSON.parse(fs.readFileSync(ktavimFile));
    const approved = data.filter(k => k.approved);
    console.log("✅ /api/ktavim called — returning approved only:");
    console.log(approved);
    res.json(approved);
  } catch (err) {
    console.error("❌ Failed to read or parse ktavim.json:", err);
    res.status(500).json({ error: 'Failed to load ktavim' });
  }
});


app.post('/api/ktavim', (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  let data = [];
  if (fs.existsSync(ktavimFile)) {
    data = JSON.parse(fs.readFileSync(ktavimFile));
  }

  const newKtav = { title, content, approved: true };
  data.push(newKtav);

  try {
    fs.writeFileSync(ktavimFile, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save new ktav:", err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.delete('/api/ktavim/:index', (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index)) return res.status(400).send('Invalid index');

  const file = path.join(__dirname, 'ktavim.json');
  if (!fs.existsSync(file)) return res.status(404).send('No ktavim data');

  const data = JSON.parse(fs.readFileSync(file));
  if (index < 0 || index >= data.length) return res.status(400).send('Index out of range');

  data.splice(index, 1);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  res.status(200).send('Deleted');
});