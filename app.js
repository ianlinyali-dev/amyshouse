const SUPABASE_URL = 'https://sfrgoujuwmctssszndrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zm8UZ9x6LlQwr-UdCziZ0g_7DbJvBbq';

document.addEventListener('DOMContentLoaded', async () => {
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log("SW Reg Error:", err));
    }

    if (!window.supabase) {
        showError("CRITICAL: Supabase library did not load. Check internet.");
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    let currentUserProfile = null;

    const authSection = document.getElementById('auth-section');
    const dashSection = document.getElementById('dashboard-section');
    const adminPanel = document.getElementById('admin-panel');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-submit-btn');
    const errorBox = document.getElementById('login-error-box');

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }

    function clearError() {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    // Check active session on load
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        await transitionToDashboard(session);
    }

    // Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();
        
        const username = document.getElementById('auth-username').value; 
        const password = document.getElementById('auth-password').value;
        
        if (!username) return showError("Please select a workspace.");

        const dummyEmail = `${username}@amyshouse.local`;
        
        loginBtn.textContent = 'Authenticating...';
        loginBtn.disabled = true;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email: dummyEmail, password: password });
            if (error) throw new Error(error.message);

            await transitionToDashboard(data.session);

        } catch (err) {
            showError("Login Failed: " + err.message);
            loginBtn.textContent = 'Enter Workspace';
            loginBtn.disabled = false;
        }
    });

    // Central UI Transition Function
    async function transitionToDashboard(session) {
        loginBtn.textContent = 'Loading Profile...';
        
        try {
            // Using maybeSingle() so it never crashes if missing
            let { data: profile, error } = await supabase.from('user_profiles').select('*').eq('id', session.user.id).maybeSingle();
            
            if (error) console.warn("Notice: Profile fetch issue, self-healing...", error);

            // Self-healing fallback: If profile is missing, generate it on the fly!
            if (!profile) {
                const email = session.user.email || '';
                const role = email.includes('admin') ? 'admin' : (email.includes('store') ? 'store_keeper' : 'department_user');
                const name = email.includes('admin') ? 'Dorothy' : (email.includes('store') ? 'Edward' : 'Jane');
                
                profile = {
                    id: session.user.id,
                    role: role,
                    generic_email: email,
                    current_staff_name: name
                };
                
                // Attempt to insert it silently
                await supabase.from('user_profiles').upsert(profile);
            }

            currentUserProfile = profile;
            
            // DIRECT INLINE STYLES - 100% immune to Tailwind class conflicts!
            authSection.style.setProperty('display', 'none', 'important');
            dashSection.style.setProperty('display', 'grid', 'important');
            logoutBtn.style.setProperty('display', 'inline-block', 'important');
            
            document.getElementById('user-display-role').textContent = `Logged in: ${profile.current_staff_name} (${profile.role})`;

            if (profile.role === 'admin') {
                adminPanel.style.display = 'block';
                loadAdminUsersTable();
            }

            initializeApp();

        } catch (err) {
            showError("Dashboard Setup Error: " + err.message);
            await supabase.auth.signOut();
            loginBtn.textContent = 'Enter Workspace';
            loginBtn.disabled = false;
        }
    }

    // Logout
    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });

    // Master Data
    async function initializeApp() {
        await loadDropdowns();
        await loadStockBalances();
    }

    document.getElementById('movement_type').addEventListener('change', (e) => {
        const donationFields = document.getElementById('donation-fields');
        if (e.target.value === 'Donation') {
            donationFields.style.display = 'block';
            document.getElementById('direction').value = 'In';
        } else {
            donationFields.style.display = 'none';
        }
    });

    async function loadDropdowns() {
        try {
            const [{ data: items }, { data: depts }, { data: donors }] = await Promise.all([
                supabase.from('items').select('*'), supabase.from('departments').select('*'), supabase.from('donors').select('*')
            ]);
            
            document.getElementById('item_id').innerHTML = '<option value="">Select...</option>' + 
                (items || []).map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');
            document.getElementById('department_id').innerHTML = '<option value="">Select...</option>' + 
                (depts || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
            document.getElementById('donor_id').innerHTML = '<option value="">Select...</option>' + 
                (donors || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        } catch (e) { console.warn("Dropdown load failed", e); }
    }

    async function loadStockBalances() {
        const tbody = document.getElementById('balances-table-body');
        const { data, error } = await supabase.from('current_stock_balances').select('*');
        
        if (error) return tbody.innerHTML = `<tr><td colspan="4" class="text-center text-red-500 p-4">Error: ${error.message}</td></tr>`;
        if (!data || !data.length) return tbody.innerHTML = `<tr><td colspan="4" class="text-center text-gray-500 p-4">No records found.</td></tr>`;

        const { data: itemsData } = await supabase.from('items').select('name, reorder_level');

        tbody.innerHTML = data.map(row => {
            const itemMaster = itemsData?.find(i => i.name === row.item_name);
            const isLow = row.balance <= (itemMaster ? itemMaster.reorder_level : 0);

            return `
            <tr class="hover:bg-gray-50">
                <td class="p-2.5 font-medium">${row.item_name}</td>
                <td class="p-2.5 text-gray-600 text-xs">${row.department_name}</td>
                <td class="p-2.5 font-bold ${isLow ? 'text-red-600' : 'text-[#0b3b2c]'}">${row.balance} <span class="text-xs font-normal text-gray-500">${row.unit}</span></td>
                <td class="p-2.5">${isLow ? '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">Restock Needed</span>' : '<span class="text-green-600 text-xs">Healthy</span>'}</td>
            </tr>`;
        }).join('');
    }

    document.getElementById('movement-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const isDonation = document.getElementById('movement_type').value === 'Donation';
        
        const payload = {
            movement_type: document.getElementById('movement_type').value,
            item_id: document.getElementById('item_id').value,
            department_id: document.getElementById('department_id').value,
            direction: document.getElementById('direction').value,
            quantity: parseFloat(document.getElementById('quantity').value),
            reason: document.getElementById('reason').value,
            performed_by_name: currentUserProfile ? `${currentUserProfile.current_staff_name} (${currentUserProfile.role})` : 'Staff Member',
            donor_id: isDonation ? document.getElementById('donor_id').value || null : null,
            donation_ref: isDonation ? document.getElementById('donation_ref').value : null,
            item_condition: isDonation ? document.getElementById('item_condition').value : null
        };

        const { error } = await supabase.from('stock_movements').insert([payload]);
        if (error) alert("Error saving: " + error.message);
        else {
            alert('Saved successfully!');
            e.target.reset();
            document.getElementById('donation-fields').style.display = 'none';
            loadStockBalances();
        }
    });

    async function loadAdminUsersTable() {
        const { data, error } = await supabase.from('user_profiles').select('*');
        if (error) return;
        
        const tbody = document.getElementById('admin-users-table');
        tbody.innerHTML = data.map(user => `
            <tr>
                <td class="p-2 text-xs font-bold">${(user.generic_email || '').replace('@amyshouse.local', '')}</td>
                <td class="p-2 text-xs font-semibold text-[#e85d04] uppercase">${user.role}</td>
                <td class="p-2 text-xs">
                    <input type="text" id="staff-name-${user.id}" value="${user.current_staff_name}" class="border rounded p-1 w-full">
                </td>
                <td class="p-2 text-xs">
                    <button class="admin-update-btn bg-[#0b3b2c] hover:bg-emerald-900 text-white px-2 py-1 rounded transition" data-userid="${user.id}">Update</button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.admin-update-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const userId = e.target.getAttribute('data-userid');
                const newName = document.getElementById(`staff-name-${userId}`).value;
                const { error } = await supabase.from('user_profiles').update({ current_staff_name: newName }).eq('id', userId);
                if (error) alert("Error updating: " + error.message);
                else alert("Staff name updated!");
            });
        });
    }

    window.addEventListener('online', () => document.getElementById('sync-status').textContent = 'Online');
    window.addEventListener('offline', () => document.getElementById('sync-status').textContent = 'Offline (Local)');
});
