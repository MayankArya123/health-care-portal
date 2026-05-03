import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

function DoctorDashboard({ user }) {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [reportText, setReportText] = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const socketRef = useRef();

  useEffect(() => {
    fetchPatients();

    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    socket.emit('join', user.id);

    socket.on('receiveMessage', (data) => {
      if (selectedPatient && (data.senderId === selectedPatient.id || data.receiverId === selectedPatient.id)) {
        setMessages((prev) => [...prev, data]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user.id, selectedPatient]);

  const fetchPatients = async () => {
    const token = localStorage.getItem('token');
    const res = await axios.get('http://localhost:5000/patients', {
      headers: { Authorization: `Bearer ${token}` }
    });
    setPatients(res.data);
  };

  const handleCreateReport = async () => {
    if (!selectedPatient || !reportText.trim()) return;

    const token = localStorage.getItem('token');
    await axios.post('http://localhost:5000/reports', {
      patientId: selectedPatient.id,
      reportText
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    alert('Report created successfully');
    setReportText('');
    setReportVisible(false);
  };

  const fetchVitals = async (patientId) => {
    const token = localStorage.getItem('token');
    const res = await axios.get(`http://localhost:5000/vitals/${patientId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setVitals(res.data.slice(0, 3));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  };

  const fetchMessages = async (patientId) => {
    const token = localStorage.getItem('token');
    const res = await axios.get(`http://localhost:5000/messages/${user.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setMessages(res.data.filter(m => m.sender_id === patientId || m.receiver_id === patientId));
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedPatient) return;

    const token = localStorage.getItem('token');
    const messageData = {
      senderId: user.id,
      receiverId: selectedPatient.id,
      message: newMessage
    };
    await axios.post('http://localhost:5000/messages', messageData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    socketRef.current.emit('sendMessage', messageData);
    setMessages((prev) => [...prev, { ...messageData, sender_name: user.name }]);
    setNewMessage('');
  };

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setReportVisible(false);
    setReportText('');
    fetchMessages(patient.id);
    fetchVitals(patient.id);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Doctor Dashboard</h1>
      <div className="grid gap-6 lg:grid-cols-4">
        <aside className="lg:col-span-1 bg-white border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Patients</h2>
            <span className="text-sm text-gray-500">{patients.length}</span>
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {patients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => selectPatient(patient)}
                className={`w-full text-left p-3 rounded-xl border transition ${selectedPatient?.id === patient.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'}`}
              >
                <p className="font-semibold">{patient.name}</p>
                <p className="text-sm text-gray-500">{patient.email}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="lg:col-span-3 space-y-6">
          {selectedPatient ? (
            <>
              <section className="bg-white border rounded-xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Patient Details</h2>
                    <p className="text-gray-600">{selectedPatient.name}</p>
                    <p className="text-gray-500 text-sm">{selectedPatient.email}</p>
                  </div>
                  <button
                    onClick={() => setReportVisible((prev) => !prev)}
                    className="px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition"
                  >
                    {reportVisible ? 'Hide Report Form' : 'Add Report'}
                  </button>
                </div>
                {reportVisible && (
                  <div className="mt-5 space-y-3">
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      className="w-full min-h-[140px] p-3 border rounded-xl focus:border-blue-400 focus:outline-none"
                      placeholder="Write medical report details for this patient..."
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setReportVisible(false);
                          setReportText('');
                        }}
                        className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateReport}
                        className="px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600"
                      >
                        Create Report
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="grid gap-6 xl:grid-cols-3">
                <div className="bg-white border rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-semibold">Recent Vitals</h2>
                      <p className="text-sm text-gray-500">Latest recorded readings for the selected patient.</p>
                    </div>
                    <span className="text-sm text-gray-500">{vitals.length ? `${vitals.length} latest` : 'No vitals yet'}</span>
                  </div>

                  <div className="space-y-4">
                    {vitals.length === 0 ? (
                      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No recent vitals available for this patient.</div>
                    ) : (
                      vitals.map((v) => (
                        <div key={v.id} className={`rounded-2xl p-4 border ${v.is_abnormal ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                          <p className="text-sm font-semibold">{formatDate(v.created_at)}</p>
                          <div className="mt-2 text-sm text-gray-700 space-y-1">
                            <p>HR: {v.heart_rate}</p>
                            <p>BP: {v.blood_pressure_systolic}/{v.blood_pressure_diastolic}</p>
                            <p>Temp: {v.temperature}</p>
                          </div>
                          <p className={`mt-3 text-sm font-semibold ${v.is_abnormal ? 'text-red-700' : 'text-green-700'}`}>{v.is_abnormal ? 'Abnormal' : 'Normal'}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white border rounded-xl p-5 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">Chat with Patient</h2>
                  <div className="space-y-3 max-h-[38vh] overflow-y-auto mb-4">
                    {messages.length === 0 ? (
                      <p className="text-gray-500">No messages yet. Start the conversation below.</p>
                    ) : (
                      messages.map((m, index) => (
                        <div key={index} className={`flex ${m.sender_id === user.id ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.sender_id === user.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
                            <p className="text-sm font-semibold mb-1">{m.sender_name}</p>
                            <p className="whitespace-pre-wrap">{m.message}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      className="w-full p-3 border rounded-xl focus:border-blue-400 focus:outline-none"
                      placeholder="Type your message..."
                    />
                    <button onClick={handleSendMessage} className="w-full py-3 rounded-xl bg-green-500 text-white hover:bg-green-600 transition">
                      Send Message
                    </button>
                  </div>
                </div>

                <div className="bg-white border rounded-xl p-5 shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">Report Quick Actions</h2>
                  <p className="text-gray-600">Use the button above to open the report composer. The text area will collapse automatically after creating a report.</p>
                  <div className="mt-6 grid gap-3">
                    <div className="rounded-2xl border border-dashed border-blue-200 p-4 bg-blue-50">
                      <p className="text-sm text-blue-700">Selected patient: <span className="font-semibold">{selectedPatient.name}</span></p>
                    </div>
                    <div className="rounded-2xl border border-dashed border-gray-200 p-4 bg-gray-50">
                      <p className="text-sm text-gray-700">You can keep the report form hidden after submission and reopen it when needed.</p>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <div className="bg-white border rounded-xl p-6 shadow-sm">
              <p className="text-gray-600">Select a patient from the list to view chat history and create new medical reports.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default DoctorDashboard;