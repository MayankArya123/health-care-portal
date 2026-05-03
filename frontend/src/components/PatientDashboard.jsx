import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

function PatientDashboard({ user }) {
  const [heartRate, setHeartRate] = useState('');
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [temp, setTemp] = useState('');
  const [vitals, setVitals] = useState([]);
  const [reports, setReports] = useState([]);
  const [expandedReports, setExpandedReports] = useState({});
  const reportRefs = useRef({});
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const socketRef = useRef();
  const [assignedDoctor, setAssignedDoctor] = useState(null);

  useEffect(() => {
    fetchVitals();
    fetchReports();
    fetchMessages();
    fetchAssignedDoctor();

    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    socket.emit('join', user.id);

    socket.on('receiveMessage', (data) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      socket.disconnect();
    };
  }, [user.id]);

  const fetchVitals = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(`http://localhost:5000/vitals/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setVitals(res.data);
  };

  const fetchReports = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(`http://localhost:5000/reports/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setReports(res.data);
  };

  const fetchMessages = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get(`http://localhost:5000/messages/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setMessages(res.data);
  };

  const fetchAssignedDoctor = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await axios.get('http://localhost:5000/assigned-doctor', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setAssignedDoctor(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch assigned doctor', error);
    }
  };

  const handleSubmitVitals = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    const res = await axios.post('http://localhost:5000/vitals', {
      heartRate: parseInt(heartRate, 10),
      bloodPressureSystolic: parseInt(bpSys, 10),
      bloodPressureDiastolic: parseInt(bpDia, 10),
      temperature: parseFloat(temp),
      doctorId: assignedDoctor?.id || null
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    alert(res.data.isAbnormal ? 'Vitals recorded - Abnormal!' : 'Vitals recorded - Normal');
    setHeartRate('');
    setBpSys('');
    setBpDia('');
    setTemp('');
    fetchVitals();
  };

  const toggleReport = (id) => {
    setExpandedReports((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      return next;
    });

    setTimeout(() => {
      if (reportRefs.current[id]) {
        reportRefs.current[id].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 0);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !assignedDoctor) return;

    const token = localStorage.getItem('token');
    const messageData = {
      senderId: user.id,
      receiverId: assignedDoctor.id,
      message: newMessage
    };

    await axios.post('http://localhost:5000/messages', messageData, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Emit via socket
    socketRef.current.emit('sendMessage', messageData);

    setMessages((prev) => [...prev, {
      sender_id: user.id,
      receiver_id: assignedDoctor.id,
      message: newMessage,
      sender_name: user.name
    }] );
    setNewMessage('');
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Patient Dashboard</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4">Record Vitals</h2>
            <form onSubmit={handleSubmitVitals} className="grid grid-cols-2 gap-4">
              <input type="number" placeholder="Heart Rate" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} className="p-2 border rounded" required />
              <input type="number" placeholder="BP Systolic" value={bpSys} onChange={(e) => setBpSys(e.target.value)} className="p-2 border rounded" required />
              <input type="number" placeholder="BP Diastolic" value={bpDia} onChange={(e) => setBpDia(e.target.value)} className="p-2 border rounded" required />
              <input type="number" step="0.1" placeholder="Temperature" value={temp} onChange={(e) => setTemp(e.target.value)} className="p-2 border rounded" required />
              <button type="submit" className="col-span-2 bg-blue-500 text-white p-2 rounded hover:bg-blue-600">Submit</button>
            </form>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Vitals History</h2>
            <div className="max-h-64 overflow-y-auto border rounded p-4 bg-gray-50">
              {vitals.length === 0 ? (
                <p className="text-gray-600">No vitals recorded yet.</p>
              ) : (
                vitals.map(v => (
                  <div key={v.id} className={`p-2 border rounded mb-2 ${v.is_abnormal ? 'bg-red-100' : 'bg-green-100'}`}>
                    HR: {v.heart_rate}, BP: {v.blood_pressure_systolic}/{v.blood_pressure_diastolic}, Temp: {v.temperature} - {v.is_abnormal ? 'Abnormal' : 'Normal'}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Medical Reports</h2>
            <div className="max-h-64 overflow-y-auto border rounded p-4 bg-gray-50">
              {reports.length === 0 ? (
                <p className="text-gray-600">No medical reports yet. Your doctor can create one for you.</p>
              ) : (
                reports.map(r => {
                  const isExpanded = expandedReports[r.id];
                  const createdAt = new Date(r.created_at).toLocaleDateString();
                  const preview = r.report_text.length > 100 ? `${r.report_text.slice(0, 100)}...` : r.report_text;

                  const reportText = isExpanded ? r.report_text : preview;
                  const textClass = `text-sm text-gray-700 mt-1 whitespace-pre-wrap ${isExpanded ? '' : 'overflow-hidden max-h-28'}`;

                  return (
                    <div key={r.id} ref={(el) => { reportRefs.current[r.id] = el; }} className="p-2 border rounded mb-2 bg-white">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800">Report • {createdAt}</p>
                          <p className={textClass}>{reportText}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleReport(r.id)}
                          className="ml-2 px-3 py-1 bg-blue-500 text-white rounded text-xs font-semibold hover:bg-blue-600 whitespace-nowrap"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? 'Collapse' : 'Expand'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <h2 className="text-xl font-semibold mb-4">Chat with Doctor</h2>
          <div className="mb-4">
            {assignedDoctor ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-gray-500 mb-1">Assigned Doctor</p>
                <p className="font-semibold text-gray-800">{assignedDoctor.name}</p>
                <p className="text-sm text-gray-600">{assignedDoctor.specialization || assignedDoctor.email}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                Assigning your doctor, please wait...
              </div>
            )}
          </div>
          <div className="border rounded p-4 h-96 overflow-y-auto mb-4 bg-gray-50">
            {assignedDoctor && messages.filter(msg => msg.sender_id == assignedDoctor.id || msg.receiver_id == assignedDoctor.id).length === 0 ? (
              <p className="text-gray-600">No messages yet.</p>
            ) : assignedDoctor ? (
              messages.filter(msg => msg.sender_id == assignedDoctor.id || msg.receiver_id == assignedDoctor.id).map((msg, index) => (
                <div key={index} className={`mb-2 ${msg.sender_id == user.id ? 'text-right' : 'text-left'}`}>
                  <p className={`inline-block p-2 rounded max-w-xs break-words ${msg.sender_id == user.id ? 'bg-blue-500 text-white' : 'bg-gray-300'}`}>
                    <strong>{msg.sender_name}:</strong> {msg.message}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-gray-600">No doctor available yet. Please check back later.</p>
            )}
          </div>
          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={assignedDoctor ? 'Type a message...' : 'No doctor assigned yet'}
              className="flex-1 p-2 border rounded"
              required
              disabled={!assignedDoctor}
            />
            <button type="submit" className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50" disabled={!assignedDoctor}>Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default PatientDashboard;