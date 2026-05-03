const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [process.env.FRONTEND_URL],
    methods: ["GET", "POST"]
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const checkAbnormal = (heartRate, bpSys, bpDia, temp) => {
  return heartRate < 60 || heartRate > 100 || bpSys < 90 || bpSys > 140 || bpDia < 60 || bpDia > 90 || temp < 36.1 || temp > 37.5;
};

const assignDefaultDoctor = async (patientId) => {
  const existing = await pool.query('SELECT doctor_id FROM appointments WHERE patient_id = $1 LIMIT 1', [patientId]);
  if (existing.rows.length > 0) return existing.rows[0].doctor_id;

  const doctorResult = await pool.query('SELECT u.id FROM users u WHERE u.role = $1 ORDER BY u.id LIMIT 1', ['doctor']);
  if (doctorResult.rows.length === 0) return null;

  const doctorId = doctorResult.rows[0].id;
  await pool.query('INSERT INTO appointments (patient_id, doctor_id, appointment_date, status) VALUES ($1, $2, NOW(), $3)', [patientId, doctorId, 'scheduled']);
  return doctorId;
};

app.use(cors({
  origin: [process.env.FRONTEND_URL]
}));
app.use(express.json());

app.post('/register', async (req, res) => {
  const { email, password, role, name } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id',
      [email, hashedPassword, role]
    );
    const userId = result.rows[0].id;
    if (role === 'patient') {
      await pool.query('INSERT INTO patient_details (id, name) VALUES ($1, $2)', [userId, name]);
      await assignDefaultDoctor(userId);
    } else if (role === 'doctor') {
      await pool.query('INSERT INTO doctor_details (id, name) VALUES ($1, $2)', [userId, name]);
    }
    res.status(201).json({ message: 'User registered' });
  } catch (error) {
    if (error.code === '23505') {
      res.status(400).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
    
    let name = '';
    if (user.role === 'patient') {
      const detailResult = await pool.query('SELECT name FROM patient_details WHERE id = $1', [user.id]);
      name = detailResult.rows[0]?.name || '';
      await assignDefaultDoctor(user.id);
    } else if (user.role === 'doctor') {
      const detailResult = await pool.query('SELECT name FROM doctor_details WHERE id = $1', [user.id]);
      name = detailResult.rows[0]?.name || '';
    }
    
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user.id, role: user.role, email: user.email, name } });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});
app.get('/patients', authenticateToken, async (req, res) => {
  if (req.user.role !== 'doctor') return res.status(403).json({ error: 'Access denied' });
  try {
    const result = await pool.query(
      'SELECT u.id, p.name, u.email FROM users u JOIN patient_details p ON u.id = p.id JOIN appointments a ON a.patient_id = u.id WHERE u.role = $1 AND a.doctor_id = $2',
      ['patient', req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

app.get('/patients/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT u.id, p.name, p.date_of_birth, p.address, p.phone FROM users u JOIN patient_details p ON u.id = p.id WHERE u.id = $1', [req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch patient' });
  }
});

app.put('/patients/:id', authenticateToken, async (req, res) => {
  const { name, date_of_birth, address, phone } = req.body;
  try {
    await pool.query('UPDATE patient_details SET name = $1, date_of_birth = $2, address = $3, phone = $4 WHERE id = $5', [name, date_of_birth, address, phone, req.params.id]);
    res.json({ message: 'Patient updated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update patient' });
  }
});

app.get('/doctors', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT u.id, d.name, d.specialization FROM users u JOIN doctor_details d ON u.id = d.id WHERE u.role = $1', ['doctor']);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

app.post('/assign-doctor', authenticateToken, async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ error: 'Access denied' });
  const { doctorId } = req.body;
  if (!doctorId) return res.status(400).json({ error: 'doctorId is required' });
  try {
    const existing = await pool.query(
      'SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 LIMIT 1',
      [req.user.id, doctorId]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO appointments (patient_id, doctor_id, appointment_date, status) VALUES ($1, $2, NOW(), $3)',
        [req.user.id, doctorId, 'scheduled']
      );
    }
    const doctor = await pool.query(
      'SELECT u.id, d.name, u.email, d.specialization FROM users u JOIN doctor_details d ON u.id = d.id WHERE u.id = $1',
      [doctorId]
    );
    res.json(doctor.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign doctor' });
  }
});

app.get('/assigned-doctor', authenticateToken, async (req, res) => {
  if (req.user.role !== 'patient') return res.status(403).json({ error: 'Access denied' });
  try {
    let doctorResult = await pool.query(
      `SELECT u.id, d.name, u.email, d.specialization
       FROM appointments a
       JOIN users u ON u.id = a.doctor_id
       JOIN doctor_details d ON d.id = u.id
       WHERE a.patient_id = $1
       ORDER BY a.appointment_date DESC
       LIMIT 1`,
      [req.user.id]
    );

    if (doctorResult.rows.length === 0) {
      const doctorId = await assignDefaultDoctor(req.user.id);
      if (doctorId) {
        doctorResult = await pool.query(
          `SELECT u.id, d.name, u.email, d.specialization
           FROM users u
           JOIN doctor_details d ON d.id = u.id
           WHERE u.id = $1`,
          [doctorId]
        );
      }
    }

    res.json(doctorResult.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assigned doctor' });
  }
});

app.get('/reports/:patientId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM medical_reports WHERE patient_id = $1', [req.params.patientId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

app.post('/reports', authenticateToken, async (req, res) => {
  const { patientId, reportText } = req.body;
  try {
    await pool.query('INSERT INTO medical_reports (patient_id, doctor_id, report_text) VALUES ($1, $2, $3)', [patientId, req.user.id, reportText]);
    res.status(201).json({ message: 'Report created' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create report' });
  }
});

app.get('/vitals/:patientId', authenticateToken, async (req, res) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (req.user.role === 'patient' && req.user.id !== patientId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (req.user.role === 'doctor') {
    const doctorCheck = await pool.query(
      'SELECT 1 FROM appointments WHERE doctor_id = $1 AND patient_id = $2 LIMIT 1',
      [req.user.id, patientId]
    );
    if (doctorCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  try {
    const result = await pool.query('SELECT * FROM patient_vitals WHERE patient_id = $1 ORDER BY created_at DESC', [patientId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vitals' });
  }
});

app.post('/vitals', authenticateToken, async (req, res) => {
  const { heartRate, bloodPressureSystolic, bloodPressureDiastolic, temperature, doctorId } = req.body;
  const isAbnormal = checkAbnormal(heartRate, bloodPressureSystolic, bloodPressureDiastolic, temperature);
  try {
    await pool.query('INSERT INTO patient_vitals (patient_id, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, temperature, is_abnormal) VALUES ($1, $2, $3, $4, $5, $6)', [req.user.id, heartRate, bloodPressureSystolic, bloodPressureDiastolic, temperature, isAbnormal]);

    if (doctorId) {
      const existingAppointment = await pool.query(
        'SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 LIMIT 1',
        [req.user.id, doctorId]
      );
      if (existingAppointment.rows.length === 0) {
        await pool.query(
          'INSERT INTO appointments (patient_id, doctor_id, appointment_date, status) VALUES ($1, $2, NOW(), $3)',
          [req.user.id, doctorId, 'scheduled']
        );
      }
    }

    res.status(201).json({ message: 'Vitals recorded', isAbnormal });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record vitals' });
  }
});

app.get('/messages/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT m.*, CASE WHEN u.role = 'patient' THEN pd.name ELSE dd.name END as sender_name 
      FROM messages m 
      JOIN users u ON m.sender_id = u.id 
      LEFT JOIN patient_details pd ON u.id = pd.id AND u.role = 'patient'
      LEFT JOIN doctor_details dd ON u.id = dd.id AND u.role = 'doctor'
      WHERE m.sender_id = $1 OR m.receiver_id = $1 
      ORDER BY m.timestamp
    `, [req.params.userId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/messages', authenticateToken, async (req, res) => {
  const { receiverId, message } = req.body;
  try {
    await pool.query('INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3)', [req.user.id, receiverId, message]);
    res.status(201).json({ message: 'Message sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

io.on('connection', (socket) => {
  socket.on('join', (room) => {
    socket.join(room);
  });
  socket.on('sendMessage', async (data) => {
    try {
      await pool.query('INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3)', [data.senderId, data.receiverId, data.message]);
      const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [data.senderId]);
      const role = userResult.rows[0].role;
      let name = '';
      if (role === 'patient') {
        const detail = await pool.query('SELECT name FROM patient_details WHERE id = $1', [data.senderId]);
        name = detail.rows[0]?.name || '';
      } else {
        const detail = await pool.query('SELECT name FROM doctor_details WHERE id = $1', [data.senderId]);
        name = detail.rows[0]?.name || '';
      }
      const emitData = { senderId: data.senderId, receiverId: data.receiverId, message: data.message, sender_name: name };
      io.to(data.receiverId).emit('receiveMessage', emitData);
    } catch (error) {
    }
  });
  socket.on('disconnect', () => {
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});