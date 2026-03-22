document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");

  if (!token || !userStr) {
    window.location.href = "/views/login.html";
    return;
  }

  const user = JSON.parse(userStr);
  if (user.role !== "professor") {
    alert("Unauthorized access. Professors only.");
    window.location.href = "/views/login.html";
    return;
  }

  const profName = document.getElementById("prof-name");
  if (profName) profName.textContent = `- Welcome, ${user.name}`;

  const statusBar = document.getElementById("status-bar");
  const startBtn = document.getElementById("start-btn");
  const captureBtn = document.getElementById("capture-btn");
  const subjectInput = document.getElementById("subject-input");
  const deptInput = document.getElementById("dept-input");
  const video = document.getElementById("webcam");
  const logsContainer = document.getElementById("logs");

  let faceMatcher = null;
  const studentsMap = new Map();
  let modelsLoaded = false;

  const updateStatus = (message, isError = false) => {
    statusBar.textContent = message;
    statusBar.style.color = isError ? "#e74c3c" : "#333";
  };

  const appendLog = (message) => {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsContainer.prepend(entry);
  };

  // --- NEW: Function to load and update Class Stats ---
  const loadClassStats = async (subject, department) => {
    try {
      document.getElementById("stats-subject-title").textContent = subject;
      
      const response = await fetch(`/api/attendance/class-stats?subject=${encodeURIComponent(subject)}&department=${encodeURIComponent(department)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error("Failed to fetch class stats");
      const data = await response.json();

      document.getElementById("total-classes-text").textContent = `Total Classes Held: ${data.totalSessions}`;
      
      const tbody = document.getElementById("class-stats-body");
      const table = document.getElementById("class-stats-table");
      const emptyState = document.getElementById("stats-empty-state");
      
      if (!tbody || !table || !emptyState) return; // Guard clause if HTML elements are missing

      tbody.innerHTML = ""; // Clear old data

      if (data.students.length === 0) {
        table.style.display = "none";
        emptyState.style.display = "block";
        emptyState.textContent = "No students found in this department.";
        return;
      }

      data.students.forEach(student => {
        let color = "#2ecc71"; // Green
        if (student.percentage < 75) color = "#f1c40f"; // Yellow
        if (student.percentage < 60) color = "#e74c3c"; // Red

        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.18)";
        tr.innerHTML = `
          <td style="padding: 10px 15px;">${student.rollNo}</td>
          <td style="padding: 10px 15px;"><strong>${student.name}</strong></td>
          <td style="padding: 10px 15px;">${student.attended} / ${data.totalSessions}</td>
          <td style="padding: 10px 15px; color: ${color}; font-weight: bold;">${student.percentage}%</td>
        `;
        tbody.appendChild(tr);
      });

      table.style.display = "table";
      emptyState.style.display = "none";
    } catch (error) {
      console.error(error);
    }
  };
  // --------------------------------------------------

  updateStatus("Enter Subject and Department, then click Load Students & Start Camera.");

  startBtn.addEventListener("click", async () => {
    const subject = subjectInput.value.trim();
    const department = deptInput.value.trim();

    if (!subject || !department) {
      alert("Please enter both Subject and Department.");
      return;
    }

    startBtn.disabled = true;

    try {
      if (!modelsLoaded) {
        updateStatus("Loading AI models...");
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models")
        ]);
        modelsLoaded = true;
      }

      updateStatus(`Fetching enrolled students from ${department}...`);
      const response = await fetch(`/api/users/students?department=${encodeURIComponent(department)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch students");
      }

      const students = await response.json();
      if (!students.length) {
        updateStatus(`No students with face data found in ${department}.`, true);
        startBtn.disabled = false;
        return;
      }

      studentsMap.clear();
      const labeledDescriptors = students.map((student) => {
        studentsMap.set(student._id, student.name);
        return new faceapi.LabeledFaceDescriptors(
          student._id,
          [new Float32Array(student.faceDescriptor)]
        );
      });

      faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);

      // --- NEW: Load the class stats table right before the camera starts ---
      await loadClassStats(subject, department);

      updateStatus(`Ready. Loaded ${students.length} students. Starting camera...`);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;

      startBtn.style.display = "none";
      captureBtn.style.display = "inline-block";
      subjectInput.disabled = true;
      deptInput.disabled = true;
      updateStatus(`Camera active for ${subject} (${department}). Click Capture & Log Attendance.`);
    } catch (error) {
      console.error(error);
      updateStatus(error.message || "Failed to initialize scanner", true);
      startBtn.disabled = false;
    }
  });

  captureBtn.addEventListener("click", async () => {
    if (!faceMatcher) return;

    const subject = subjectInput.value.trim();
    if (!subject) {
      updateStatus("Subject is required.", true);
      return;
    }

    if (!video.videoWidth || !video.videoHeight) {
      updateStatus("Camera is not ready yet. Please try again.", true);
      return;
    }

    captureBtn.disabled = true;
    captureBtn.textContent = "Processing...";
    updateStatus("Capturing frame...");

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const detection = await faceapi
        .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!detection) {
        updateStatus("No face detected. Aim properly and try again.", true);
        return;
      }

      const match = faceMatcher.findBestMatch(detection.descriptor);
      if (match.label === "unknown") {
        updateStatus("Face not recognized in this class list.", true);
        return;
      }

      const studentId = match.label;
      const studentName = studentsMap.get(studentId) || studentId;

      const response = await fetch("/api/attendance/log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ studentId, subject })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Failed to log attendance");
      }

      updateStatus(`Logged ${studentName}!`);
      appendLog(`<span class="success-text">Success:</span> Logged ${studentName} (${subject})`);

      // --- NEW: Refresh the stats table immediately after a successful scan ---
      loadClassStats(subject, document.getElementById("dept-input").value.trim());

    } catch (error) {
      console.error(error);
      updateStatus(error.message || "Failed during capture", true);
    } finally {
      captureBtn.disabled = false;
      captureBtn.textContent = "Capture & Log Attendance";
      canvas.width = 0;
      canvas.height = 0;
    }
  });
});