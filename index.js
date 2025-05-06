const express = require('express');
const path = require('path');
const ktavimFile = path.join(__dirname, 'ktavim.json');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(cors()); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/pending-gallery', express.static(path.join(__dirname, 'pending-gallery')));
app.use('/gallery', express.static(path.join(__dirname, 'gallery')));
// Set up multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'pending-gallery'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

app.post('/api/gallery', upload.single('image'), (req, res) => {
  const caption = req.body.caption || '';
  const uploader = req.body.uploader || 'לא ידוע';
  const filename = req.file.filename;

  const pending = JSON.parse(fs.readFileSync(path.join(__dirname, 'pending-gallery.json')));
  pending.push({ filename, caption, uploader });
  fs.writeFileSync(path.join(__dirname, 'pending-gallery.json'), JSON.stringify(pending, null, 2));

  res.status(200).json({ message: 'Image uploaded and pending approval' });
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
  const pendingList = JSON.parse(fs.readFileSync(path.join(__dirname, 'pending-gallery.json')));
  const approvedList = JSON.parse(fs.readFileSync(path.join(__dirname, 'gallery.json')));

  if (index >= 0 && index < pendingList.length) {
    const item = pendingList.splice(index, 1)[0];
    const oldPath = path.join(__dirname, 'pending-gallery', item.filename);
    const newPath = path.join(__dirname, 'gallery', item.filename);

    fs.renameSync(oldPath, newPath);
    approvedList.push(item);

    fs.writeFileSync(path.join(__dirname, 'pending-gallery.json'), JSON.stringify(pendingList, null, 2));
    fs.writeFileSync(path.join(__dirname, 'gallery.json'), JSON.stringify(approvedList, null, 2));
    res.status(200).json({ message: 'Gallery item approved' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});

// Delete pending gallery item
app.post('/api/gallery/delete/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const pendingList = JSON.parse(fs.readFileSync(path.join(__dirname, 'pending-gallery.json')));

  if (index >= 0 && index < pendingList.length) {
    const item = pendingList.splice(index, 1)[0];
    const filePath = path.join(__dirname, 'pending-gallery', item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.writeFileSync(path.join(__dirname, 'pending-gallery.json'), JSON.stringify(pendingList, null, 2));
    res.status(200).json({ message: 'Pending gallery item deleted' });
  } else {
    res.status(400).json({ error: 'Invalid index' });
  }
});

// Delete approved gallery item
app.post('/api/gallery/delete-approved/:index', (req, res) => {
  const index = parseInt(req.params.index);
  const approvedList = JSON.parse(fs.readFileSync(path.join(__dirname, 'gallery.json')));

  if (index >= 0 && index < approvedList.length) {
    const item = approvedList.splice(index, 1)[0];
    const filePath = path.join(__dirname, 'gallery', item.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    fs.writeFileSync(path.join(__dirname, 'gallery.json'), JSON.stringify(approvedList, null, 2));
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