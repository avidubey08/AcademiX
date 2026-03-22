document.addEventListener("DOMContentLoaded", async () => {
  // 1. Check Auth & Role
  const token = localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  
  if (!token || !userStr) {
      window.location.href = "/views/login.html";
      return;
  }
  
  const user = JSON.parse(userStr);
  if (user.role !== "student") {
      alert("Unauthorized access. Students only.");
      window.location.href = "/views/login.html";
      return;
  }
  
  document.getElementById("student-name").textContent = `- Welcome, ${user.name}`;
  
  const loadingDiv = document.getElementById("loading");
  const table = document.getElementById("attendance-table");
  const tbody = document.getElementById("attendance-body");
  const emptyState = document.getElementById("empty-state");
  const statsContainer = document.getElementById("attendance-stats-container");

  // 2. Load Attendance History (The Table)
  const loadData = async () => {
      try {
          const resp = await fetch("/api/attendance/my", {
              headers: { "Authorization": `Bearer ${token}` }
          });
          if (!resp.ok) throw new Error("Failed to fetch records");
          
          const records = await resp.json();
          tbody.innerHTML = "";
          
          if (records.length === 0) {
              table.style.display = "none";
              emptyState.style.display = "block";
          } else {
              records.forEach(record => {
                  const tr = document.createElement("tr");
                  const date = new Date(record.timestamp).toLocaleString();
                  tr.innerHTML = `
                      <td>${date}</td>
                      <td><strong>${record.subject}</strong></td>
                      <td>${record.professorName}</td>
                  `;
                  tbody.appendChild(tr);
              });
              table.style.display = "table";
              emptyState.style.display = "none";
          }
      } catch (error) {
          console.error(error);
          loadingDiv.textContent = "Error loading attendance records.";
          loadingDiv.style.color = "#e74c3c";
          loadingDiv.style.backgroundColor = "#fadbd8";
      }
  };

  // 3. Load Attendance Stats (The Progress Bars)
  const loadAttendanceStats = async () => {
      try {
          const response = await fetch("/api/attendance/stats", {
            headers: { Authorization: `Bearer ${token}` } // Uses the token from step 1
          });

          if (!response.ok) throw new Error("Failed to load stats");
          const stats = await response.json();

          statsContainer.innerHTML = ""; 

          if (stats.length === 0) {
            statsContainer.innerHTML = "<p>No attendance stats available yet.</p>";
            return;
          }

          stats.forEach(stat => {
            let colorClass = "good"; 
            if (stat.percentage < 75) colorClass = "warning"; 
            if (stat.percentage < 60) colorClass = "danger"; 

            const statDiv = document.createElement("div");
            statDiv.className = `stat-card ${colorClass}`;
            statDiv.innerHTML = `
              <h3>${stat.subject}</h3>
              <p><strong>${stat.percentage}%</strong></p>
              <small>${stat.attended} / ${stat.total} Classes Attended</small>
              
              <div class="progress-bar-bg" style="width: 100%; background: #ddd; height: 10px; border-radius: 5px; margin-top: 5px;">
                <div class="progress-bar-fill" style="width: ${stat.percentage}%; background: var(--${colorClass}-color, #2ecc71); height: 100%; border-radius: 5px; transition: width 0.5s ease;"></div>
              </div>
            `;
            statsContainer.appendChild(statDiv);
          });

      } catch (error) {
          console.error(error);
          statsContainer.innerHTML = "<p style='color:red;'>Failed to load stats.</p>";
      }
  };

  // 4. Initial Load (Fetch both simultaneously for speed!)
  await Promise.all([loadData(), loadAttendanceStats()]);
  loadingDiv.style.display = "none";

  // 5. Connect to WebSockets to get real-time notifications
  const socket = io();
  socket.emit("student:identify", { studentId: user.id });

  socket.on("attendance_logged", (data) => {
      // Refresh BOTH the table and the stats automatically!
      loadData();
      loadAttendanceStats();
      
      if (Notification.permission === "granted") {
          new Notification("Attendance Logged", {
             body: `You were just marked present for ${data.subject}!`,
             icon: "/favicon.ico" 
          });
      }
  });

  if (Notification.permission !== "denied") {
      Notification.requestPermission();
  }
});