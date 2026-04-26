// Qudozen Command Center - App Logic

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Auth Check
    const meRes = await fetch('/api/dashboard/me');
    const me = await meRes.json();
    
    if (!me.authenticated) {
        window.location.href = '/dashboard/login';
        return;
    }

    document.getElementById('clinicNameDisplay').innerText = me.clinicName;

    // 2. Fetch Data
    loadMetrics();
    loadFeed();
    loadCalendar();

    // 3. Logout
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/api/dashboard/logout', { method: 'POST' });
        window.location.href = '/dashboard/login';
    });
});

async function loadMetrics() {
    try {
        const res = await fetch('/api/dashboard/metrics');
        const data = await res.json();
        
        document.getElementById('stat_appts').innerText = data.appointments_this_week || 0;
        document.getElementById('stat_reminders').innerText = data.reminders_sent || 0;
        document.getElementById('stat_revenue').innerText = (data.booking_value || 0).toLocaleString();
        document.getElementById('stat_convos').innerText = data.conversations_handled || 0;
    } catch (err) {
        console.error('Failed to load metrics:', err);
    }
}

async function loadFeed() {
    try {
        const res = await fetch('/api/dashboard/feed');
        const data = await res.json();
        
        const list = document.getElementById('feedList');
        if (!data || data.length === 0) {
            list.innerHTML = '<div class="empty-msg">No recent interactions found.</div>';
            return;
        }

        list.innerHTML = data.map(item => `
            <div class="feed-item">
                <div class="patient-info">
                    <h4>${item.name || item.phone}</h4>
                    <p>${item.treatment} • ${formatDate(item.created_at)}</p>
                </div>
                <div class="status-badge status-${item.status || 'pending'}">
                    ${item.status || 'pending'}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load feed:', err);
    }
}

async function loadCalendar() {
    try {
        const res = await fetch('/api/dashboard/calendar');
        const data = await res.json();
        
        // Clear cells
        for (let i = 0; i < 7; i++) {
            document.getElementById(`day_${i}`).innerHTML = '';
        }

        if (!data) return;

        data.forEach(appt => {
            const date = new Date(appt.preferred_date_iso);
            const dayIndex = date.getDay();
            const cell = document.getElementById(`day_${dayIndex}`);
            
            if (cell) {
                const pill = document.createElement('div');
                pill.className = `appt-pill ${getPillClass(appt.status)}`;
                pill.title = `${appt.time_slot} - ${appt.name} (${appt.treatment})`;
                pill.innerText = `${appt.time_slot} - ${appt.name}`;
                cell.appendChild(pill);
            }
        });
    } catch (err) {
        console.error('Failed to load calendar:', err);
    }
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + d.toLocaleDateString();
}

function getPillClass(status) {
    switch(status) {
        case 'confirmed': return 'pill-teal';
        case 'cancelled': return 'pill-gray';
        case 'no-show': return 'pill-red';
        default: return 'pill-teal';
    }
}

function getPillClass(status) {
    if (status === 'confirmed') return 'pill-teal';
    if (status === 'cancelled') return 'pill-gray';
    if (status === 'no-show') return 'pill-red';
    return 'pill-teal';
}
