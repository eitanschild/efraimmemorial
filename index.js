const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const session = require('express-session');
const app = express();
const multer = require('multer');
const staticGalleryUpload = multer({ dest: 'temp_uploads/' });


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
app.get('/api/videos', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, youtubeid, section FROM videos ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching videos:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});


// POST a new video (admin only)
app.post('/api/videos', async (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { title, youtubeId, section } = req.body;

  if (!title || !youtubeId || !section) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    await pool.query(
      'INSERT INTO videos (title, youtubeid, section) VALUES ($1, $2, $3)',
      [title, youtubeId, section]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error inserting video:', err);
    res.status(500).json({ error: 'Failed to save video' });
  }
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

const PORT = process.env.PORT || 3001;


const axios = require('axios');


app.delete('/api/videos/:id', async (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await pool.query('DELETE FROM videos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting video:', err);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

app.use('/static-gallery', express.static(path.join(__dirname, 'static-gallery')));

app.post('/api/static-gallery', staticGalleryUpload.single('image'), (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  const fs = require('fs');
  const oldPath = req.file.path;
  const targetFile = req.body.target;

  if (!targetFile || !/^img[1-6]\\.jpg$/.test(targetFile)) {
    fs.unlinkSync(oldPath);
    return res.status(400).json({ error: 'Invalid target image name' });
  }

  const newPath = path.join(__dirname, 'static-gallery', targetFile);

  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error('Rename error:', err);
      return res.status(500).json({ error: 'Failed to replace image' });
    }
    res.json({ success: true });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ ktavim: [], memories: [], videos: [] });

  try {
    const [ktavQuery, memQuery, vidQuery] = await Promise.all([
      pool.query(`
        SELECT id, title, content
        FROM ktavim
        WHERE approved = true AND (LOWER(title) LIKE $1 OR LOWER(content) LIKE $1)
      `, [`%${q}%`]),

      pool.query(`
        SELECT id, name, message
        FROM memories
        WHERE approved = true AND (LOWER(name) LIKE $1 OR LOWER(message) LIKE $1)
      `, [`%${q}%`]),

      pool.query(`
        SELECT id, title, youtubeid, section
        FROM videos
        WHERE LOWER(title) LIKE $1
      `, [`%${q}%`])
    ]);

    res.json({
      ktavim: ktavQuery.rows,
      memories: memQuery.rows,
      videos: vidQuery.rows
    });

  } catch (err) {
    console.error('❌ Error in /api/search:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});



// --- כתבי אפרים Routes ---
app.post('/api/ktavim', async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    await pool.query(
      'INSERT INTO ktavim (title, content, approved) VALUES ($1, $2, true)',
      [title, content]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error saving ktav:', err);
    res.status(500).json({ error: 'Failed to save ktav' });
  }
});


app.get('/api/ktavim', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content, created_at AS date FROM ktavim WHERE approved = true ORDER BY date DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching ktavim:', err);
    res.status(500).json({ error: 'Failed to fetch ktavim' });
  }
});


app.delete('/api/ktavim/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await pool.query('DELETE FROM ktavim WHERE id = $1', [id]);
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    console.error('❌ Error deleting ktav:', err);
    res.status(500).json({ error: 'Failed to delete ktav' });
  }
});
