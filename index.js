const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');

const ktavimFile = path.join(__dirname, 'ktavim.json');

const app = express();


// Allow only your Vercel frontend
const allowedOrigins = [
  'https://www.ephraimjackman.com',
  'https://efraimmemorial-frontend.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));


app.use(bodyParser.json());

// Password Protection
app.post('/auth', (req, res) => {
  const { username, password } = req.body;

  console.log('username:', username);
  console.log('password:', password);
  console.log('expected:', process.env.ADMIN_PASSWORD);

  if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
    return res.sendStatus(200);
  }

  res.sendStatus(401);
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


app.use(cors());
app.use(bodyParser.json());

const pendingFile = path.join(__dirname, 'pendingMemories.json');
const approvedFile = path.join(__dirname, 'approvedMemories.json');

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

