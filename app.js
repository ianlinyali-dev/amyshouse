// ==============================================================================
// MSCP AMY'S HOUSE INVENTORY SYSTEM - BULLETPROOF APP CONTROLLER
// ==============================================================================

const SUPABASE_URL = 'https://sfrgoujuwmctssszndrs.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zm8UZ9x6LlQwr-UdCziZ0g_7DbJvBbq';

document.addEventListener('DOMContentLoaded', async () => {

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Registration:', err));
    }

    if (!window.supabase) {
        alert('Critical error: Supabase CDN failed to load. Check your internet connection.');
        return;
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Global in-memory cache
    let cachedItems = [];
    let cachedDepts = [];
    let cachedDonors = [];
    let cachedBalances = [];
    let cachedMovements = [];
    let cachedDonations = [];
    let cachedAssets = [];
    let cachedStaff = [];

    let currentUserName = '';
    let currentUserDeptCode = '';
    let currentUserEmail = '';

    // DOM Elements
    const authSection = document.getElementById('auth-section');
    const dashSection = document.getElementById('dashboard-section');
    const appNavTabs = document.getElementById('app-nav-tabs');
    const logoutBtn = document.getElementById('logout-btn');
    const myProfileBtn = document.getElementById('btn-edit-my-profile');
    const loginForm = document.getElementById('login-form');
    const errorBox = document.getElementById('login-error-box');

    // --------------------------------------------------------------------------
    // 1. AUTHENTICATION & SESSION
    // --------------------------------------------------------------------------
    const { data: { session } } = await supabase.auth.getSession();
    const savedStaffName = sessionStorage.getItem('staff_name');
    const savedDeptCode = sessionStorage.getItem('dept_code');
    const savedEmail = sessionStorage.getItem('staff_email');

    if (session && savedStaffName && savedDeptCode) {
        currentUserName = savedStaffName;
        currentUserDeptCode = savedDeptCode;
        currentUserEmail = savedEmail || `${savedDeptCode.toLowerCase()}@amyshouse.org`;
        initDashboard();
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.style.display = 'none';

        const deptCode = document.getElementById('auth-dept-code').value.toUpperCase().trim();
        const staffName = document.getElementById('auth-staff-name').value.trim();
        const password = document.getElementById('auth-password').value;

        if (!deptCode || !staffName) {
            errorBox.textContent = 'Please choose a department and enter your staff name.';
            errorBox.style.display = 'block';
            return;
        }

        const email = `${deptCode.toLowerCase()}@amyshouse.org`;
        const submitBtn = document.getElementById('login-submit-btn');
        submitBtn.textContent = 'Verifying...';
        submitBtn.disabled = true;

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw new Error('Invalid Department PIN or Password: ' + error.message);

            sessionStorage.setItem('staff_name', staffName);
            sessionStorage.setItem('dept_code', deptCode);
            sessionStorage.setItem('staff_email', email);

            currentUserName = staffName;
            currentUserDeptCode = deptCode;
            currentUserEmail = email;

            initDashboard();
        } catch (err) {
            errorBox.textContent = err.message;
            errorBox.style.display = 'block';
            submitBtn.textContent = 'Unlock System';
            submitBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await supabase.auth.signOut();
        sessionStorage.clear();
        window.location.reload();
    });

    function initDashboard() {
        authSection.style.display = 'none';
        dashSection.style.display = 'block';
        appNavTabs.style.display = 'block';
        logoutBtn.style.display = 'inline-block';
        myProfileBtn.style.display = 'inline-block';

        const isAdmin = currentUserDeptCode === 'AD001';
        const roleTitle = isAdmin 
            ? 'Executive Admin' 
            : currentUserDeptCode === 'ST001' 
            ? 'Central Storekeeper' 
            : `Department User [${currentUserDeptCode}]`;

        document.getElementById('user-display-role').textContent = `${currentUserName} · ${roleTitle}`;

        if (isAdmin) {
            document.getElementById('nav-btn-accounts').style.display = 'flex';
        }

        setupTabNavigation();
        loadMasterMetadata();
        setupFilters();
        refreshAllViews();
    }

    // --------------------------------------------------------------------------
    // 2. ACTION CENTRE: EXPIRY & URGENT STOCK ALERTS
    // --------------------------------------------------------------------------
    async function loadActionCentre() {
        const panel = document.getElementById('action-centre-panel');
        const container = document.getElementById('action-centre-items');
        const countBadge = document.getElementById('action-centre-count');

        const { data: alerts, error } = await supabase.from('action_centre_alerts').select('*');
        if (error || !alerts || !alerts.length) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        countBadge.textContent = `${alerts.length} Urgent Alert${alerts.length > 1 ? 's' : ''}`;

        container.innerHTML = alerts.map(a => {
            const isExpired = a.alert_status === 'EXPIRED';
            return `
                <div class="py-2 flex flex-col md:flex-row md:items-center justify-between gap-2 ${isExpired ? 'bg-red-50/60 p-2 rounded' : ''}">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold ${isExpired ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900'}">
                            ${isExpired ? '🔴 EXPIRED' : `🟡 EXPIRES IN ${a.days_remaining} DAYS`}
                        </span>
                        <span class="font-bold text-gray-900">${a.item_name}</span>
                        <span class="text-gray-500">(${a.quantity} ${a.unit} in ${a.department_name})</span>
                        <span class="text-xs font-mono text-gray-400">Batch Expiry: ${a.expiry_date}</span>
                    </div>
                    <div>
                        <button onclick="window.handleActionCentreAlert('${a.item_id}', '${a.item_name}', '${isExpired ? 'Spoilage or Loss' : 'Weekly Supply'}')" class="text-xs font-semibold px-2.5 py-1 rounded transition ${isExpired ? 'bg-red-700 hover:bg-red-800 text-white' : 'bg-[#0b3b2c] hover:bg-[#07281c] text-white'}">
                            ${isExpired ? 'Write off as Spoilage' : 'Prioritize for Consumption (FIFO)'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.handleActionCentreAlert = (itemId, itemName, recommendedMovement) => {
        document.querySelector('[data-tab="tab-move"]').click();
        document.getElementById('movement_type').value = recommendedMovement;
        document.getElementById('movement_type').dispatchEvent(new Event('change'));
        document.getElementById('item_id').value = itemId;
        document.getElementById('reason').value = `Action Centre: ${recommendedMovement} for ${itemName}`;
    };

    // --------------------------------------------------------------------------
    // 3. TAB NAVIGATION
    // --------------------------------------------------------------------------
    function setupTabNavigation() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('bg-emerald-900', 'text-white'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

                btn.classList.add('bg-emerald-900', 'text-white');
                const targetId = btn.getAttribute('data-tab');
                document.getElementById(targetId).classList.remove('hidden');

                if (targetId === 'tab-stock') loadStockBalances();
                if (targetId === 'tab-move') checkAndGenerateDonationRef();
                if (targetId === 'tab-ledger') loadLedgerRecords();
                if (targetId === 'tab-donations') loadDonationRegister();
                if (targetId === 'tab-donors') loadDonorsDirectory();
                if (targetId === 'tab-assets') loadAssets();
                if (targetId === 'tab-replenishment') loadReplenishmentList();
                if (targetId === 'tab-accounts') loadStaffAccounts();
            });
        });
    }

    // --------------------------------------------------------------------------
    // 4. MASTER METADATA & DROPDOWNS
    // --------------------------------------------------------------------------
    async function loadMasterMetadata() {
        try {
            const [{ data: items }, { data: depts }, { data: donors }] = await Promise.all([
                supabase.from('items').select('*').order('name'),
                supabase.from('departments').select('*').order('name'),
                supabase.from('donors').select('*').order('name')
            ]);

            cachedItems = items || [];
            cachedDepts = depts || [];
            cachedDonors = donors || [];

            populateDropdowns();
        } catch (err) {
            console.error('Metadata load error:', err);
        }
    }

    function populateDropdowns() {
        const itemSelect = document.getElementById('item_id');
        itemSelect.innerHTML = '<option value="">Select Item...</option>' + 
            cachedItems.map(i => `<option value="${i.id}">${i.name} (${i.unit})${i.is_perishable ? ' [Perishable]' : ''}</option>`).join('');

        const deptSelect = document.getElementById('department_id');
        const assetDeptSelect = document.getElementById('asset_dept_id');
        const filterStockDept = document.getElementById('filter-stock-dept');
        const filterLedgerDept = document.getElementById('filter-ledger-dept');
        const filterAssetsDept = document.getElementById('filter-assets-dept');

        const deptOptions = '<option value="">Select Department...</option>' + 
            cachedDepts.map(d => `<option value="${d.id}">${d.name} (${d.dept_code})</option>`).join('');

        deptSelect.innerHTML = deptOptions;
        assetDeptSelect.innerHTML = deptOptions;

        const filterOptions = '<option value="ALL">All Departments</option>' + 
            cachedDepts.map(d => `<option value="${d.dept_code}">${d.name}</option>`).join('');

        filterStockDept.innerHTML = filterOptions;
        filterLedgerDept.innerHTML = filterOptions;
        filterAssetsDept.innerHTML = filterOptions;

        populateDonorsDropdown();
    }

    function populateDonorsDropdown() {
        const donorSelect = document.getElementById('donor_id');
        donorSelect.innerHTML = '<option value="">Select Donor...</option>' + 
            cachedDonors.map(dn => `<option value="${dn.id}">${dn.name}</option>`).join('');
    }

    document.getElementById('item_id').addEventListener('change', (e) => {
        const item = cachedItems.find(i => i.id === e.target.value);
        const hint = document.getElementById('item-current-price-hint');
        const priceInput = document.getElementById('unit_price');
        if (item) {
            const price = item.last_purchase_price || item.standard_cost || 0;
            hint.textContent = `Standard: KES ${price}`;
            if (!priceInput.value) priceInput.value = price;
        } else {
            hint.textContent = '';
        }
    });

    // --------------------------------------------------------------------------
    // 5. AUTO DONATION REF GENERATION
    // --------------------------------------------------------------------------
    async function checkAndGenerateDonationRef() {
        const moveType = document.getElementById('movement_type').value;
        if (!moveType.startsWith('Donation')) return;

        let prefix = 'AH';
        const deptId = document.getElementById('department_id').value;
        const dept = cachedDepts.find(d => d.id === deptId);

        if (dept) {
            if (dept.dept_code === 'FC001') prefix = 'FC';
            else if (dept.dept_code === 'ES001') prefix = 'ES';
            else if (dept.dept_code === 'EE001') prefix = 'EE';
            else if (dept.dept_code === 'FN001') prefix = 'FN';
        }

        const { data: refNum, error } = await supabase.rpc('get_next_donation_ref', { dept_prefix: prefix });
        if (!error && refNum) {
            document.getElementById('donation_ref').value = refNum;
        }
    }

    document.getElementById('department_id').addEventListener('change', checkAndGenerateDonationRef);

    document.getElementById('movement_type').addEventListener('change', async (e) => {
        const val = e.target.value;
        const donationFields = document.getElementById('donation-fields');
        const directionSelect = document.getElementById('direction');

        if (val.startsWith('Donation')) {
            donationFields.style.display = 'block';
            directionSelect.value = 'In';
            await checkAndGenerateDonationRef();
        } else {
            donationFields.style.display = 'none';
        }

        if (['Purchase', 'Farm Produce'].includes(val)) {
            directionSelect.value = 'In';
        } else if (['Weekly Supply', 'Top-up', 'Issue to Department', 'Spoilage or Loss'].includes(val)) {
            directionSelect.value = 'Out';
        }
    });

    // --------------------------------------------------------------------------
    // 6. RECORD STOCK MOVEMENT
    // --------------------------------------------------------------------------
    document.getElementById('movement-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const moveType = document.getElementById('movement_type').value;
        const isDonation = moveType.startsWith('Donation');
        const itemId = document.getElementById('item_id').value;
        const deptId = document.getElementById('department_id').value;
        const direction = document.getElementById('direction').value;
        const quantity = parseFloat(document.getElementById('quantity').value);
        const unitPrice = parseFloat(document.getElementById('unit_price').value) || 0;
        const totalCost = unitPrice * quantity;
        const reasonText = document.getElementById('reason').value.trim();

        if (direction === 'Out') {
            const { data: balanceCheck } = await supabase
                .from('current_stock_balances')
                .select('balance')
                .eq('item_id', itemId)
                .eq('department_id', deptId)
                .maybeSingle();

            const currentAvailable = balanceCheck ? balanceCheck.balance : 0;
            if (quantity > currentAvailable) {
                if (!confirm(`Warning: Only ${currentAvailable} in stock for this department. Record anyway as an authorized adjustment?`)) {
                    return;
                }
            }
        }

        const payload = {
            item_id: itemId,
            department_id: deptId,
            movement_type: moveType,
            direction: direction,
            quantity: quantity,
            unit_price: unitPrice,
            total_cost: totalCost,
            reason_category: document.getElementById('reason_category').value || null,
            people_count: parseInt(document.getElementById('people_count').value) || null,
            reason: reasonText || null,
            notes: reasonText || null,
            expiry_date: document.getElementById('expiry_date').value || null,
            performed_by_name: currentUserName,
            performed_by_email: currentUserEmail,
            performed_by_dept: currentUserDeptCode,
            donor_id: isDonation ? document.getElementById('donor_id').value || null : null,
            donation_ref: isDonation ? document.getElementById('donation_ref').value || null : null,
            donor_intent: isDonation ? (moveType.includes('Amy') ? 'Unrestricted' : 'Department Specific') : null,
            item_condition: isDonation ? document.getElementById('item_condition').value || 'Good' : null
        };

        const saveBtn = document.getElementById('btn-save-movement');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving Movement...';

        try {
            const { error } = await supabase.from('stock_movements').insert([payload]);
            if (error) throw error;

            alert('Movement saved successfully! Price and stock updated.');
            document.getElementById('movement-form').reset();
            document.getElementById('donation-fields').style.display = 'none';
            await loadMasterMetadata();
            refreshAllViews();
        } catch (err) {
            alert('Error saving movement: ' + err.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Confirm & Save Movement';
        }
    });

    // --------------------------------------------------------------------------
    // 7. CATALOG & PRICING EDITOR
    // --------------------------------------------------------------------------
    document.getElementById('btn-open-catalog-edit').addEventListener('click', () => {
        renderCatalogEditor();
        document.getElementById('modal-catalog-editor').classList.remove('hidden');
    });

    function renderCatalogEditor() {
        const tbody = document.getElementById('catalog-editor-table-body');
        tbody.innerHTML = cachedItems.map(item => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2 font-bold text-[#0b3b2c]">${item.name}</td>
                <td class="p-2"><input type="text" id="cat-unit-${item.id}" value="${item.unit}" class="w-16 p-1 border rounded text-xs"></td>
                <td class="p-2"><input type="number" id="cat-price-${item.id}" value="${item.standard_cost || 0}" step="0.5" class="w-20 p-1 border rounded text-xs font-mono"></td>
                <td class="p-2"><input type="number" id="cat-reorder-${item.id}" value="${item.reorder_level || 5}" step="1" class="w-16 p-1 border rounded text-xs font-mono"></td>
                <td class="p-2 text-center"><input type="checkbox" id="cat-perish-${item.id}" ${item.is_perishable ? 'checked' : ''} class="rounded text-[#0b3b2c]"></td>
                <td class="p-2 text-right">
                    <button onclick="window.saveCatalogItem('${item.id}')" class="bg-[#0b3b2c] hover:bg-[#07281c] text-white px-2 py-1 rounded text-xs font-semibold">Save</button>
                </td>
            </tr>
        `).join('');
    }

    window.saveCatalogItem = async (itemId) => {
        const payload = {
            unit: document.getElementById(`cat-unit-${itemId}`).value.trim(),
            standard_cost: parseFloat(document.getElementById(`cat-price-${itemId}`).value) || 0,
            last_purchase_price: parseFloat(document.getElementById(`cat-price-${itemId}`).value) || 0,
            reorder_level: parseFloat(document.getElementById(`cat-reorder-${itemId}`).value) || 0,
            is_perishable: document.getElementById(`cat-perish-${itemId}`).checked
        };

        const { error } = await supabase.from('items').update(payload).eq('id', itemId);
        if (error) {
            alert('Error updating item: ' + error.message);
        } else {
            alert('Item details and pricing updated successfully!');
            await loadMasterMetadata();
            refreshAllViews();
        }
    };

    // --------------------------------------------------------------------------
    // 8. DONORS DIRECTORY
    // --------------------------------------------------------------------------
    document.getElementById('btn-open-add-donor').addEventListener('click', () => {
        document.getElementById('form-donor-editor').reset();
        document.getElementById('edit_donor_id').value = '';
        document.getElementById('modal-donor-title').textContent = 'Register New Donor';
        document.getElementById('modal-donor-editor').classList.remove('hidden');
    });

    document.getElementById('btn-open-new-donor-modal').addEventListener('click', () => {
        document.getElementById('form-donor-editor').reset();
        document.getElementById('edit_donor_id').value = '';
        document.getElementById('modal-donor-title').textContent = 'Register New Donor';
        document.getElementById('modal-donor-editor').classList.remove('hidden');
    });

    document.getElementById('form-donor-editor').addEventListener('submit', async (e) => {
        e.preventDefault();
        const donorId = document.getElementById('edit_donor_id').value;
        const payload = {
            name: document.getElementById('donor_full_name').value.trim(),
            contact_info: document.getElementById('donor_contact_info').value.trim()
        };

        let result;
        if (donorId) {
            result = await supabase.from('donors').update(payload).eq('id', donorId);
        } else {
            result = await supabase.from('donors').insert([payload]);
        }

        if (result.error) {
            alert('Error saving donor: ' + result.error.message);
        } else {
            alert('Donor profile saved successfully!');
            document.getElementById('modal-donor-editor').classList.add('hidden');
            await loadMasterMetadata();
            loadDonorsDirectory();
        }
    });

    async function loadDonorsDirectory() {
        const tbody = document.getElementById('donors-table-body');
        const { data, error } = await supabase.from('donors').select('*').order('name');
        if (error) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedDonors = data || [];
        populateDonorsDropdown();

        if (!cachedDonors.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-400">No donors registered yet.</td></tr>';
            return;
        }

        tbody.innerHTML = cachedDonors.map(d => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-bold text-gray-900">${d.name}</td>
                <td class="p-2.5 text-gray-600">${d.contact_info || '—'}</td>
                <td class="p-2.5 text-gray-400 text-xs">${new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                <td class="p-2.5 text-right">
                    <button onclick="window.editDonor('${d.id}')" class="text-xs bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded text-gray-700 font-semibold">Edit Details</button>
                </td>
            </tr>
        `).join('');
    }

    window.editDonor = (donorId) => {
        const d = cachedDonors.find(donor => donor.id === donorId);
        if (!d) return;

        document.getElementById('edit_donor_id').value = d.id;
        document.getElementById('donor_full_name').value = d.name;
        document.getElementById('donor_contact_info').value = d.contact_info || '';
        document.getElementById('modal-donor-title').textContent = 'Edit Donor Details';
        document.getElementById('modal-donor-editor').classList.remove('hidden');
    };

    // --------------------------------------------------------------------------
    // 9. REPLENISHMENT LIST (BULLETPROOF FALLBACK LOGIC)
    // --------------------------------------------------------------------------
    async function loadReplenishmentList() {
        const tbody = document.getElementById('replenishment-table-body');
        const budgetElem = document.getElementById('total-market-budget');

        const { data, error } = await supabase.from('replenishment_needed_view').select('*');
        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        if (!data || !data.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-emerald-700 font-semibold">🎉 All items are adequately stocked! No orders needed.</td></tr>`;
            budgetElem.textContent = 'Estimated Budget: KES 0.00';
            return;
        }

        let totalEst = 0;
        tbody.innerHTML = data.map(r => {
            totalEst += Number(r.estimated_cost);
            const isFarm = r.category === 'Farm Produce';
            // Defensive price fallback: uses effective_unit_price, standard_cost, or 0
            const unitPrice = Number(r.effective_unit_price ?? r.standard_cost ?? 0);

            return `
                <tr class="hover:bg-amber-50/50 border-b">
                    <td class="p-2.5 font-bold text-gray-900">${r.item_name}</td>
                    <td class="p-2.5 text-gray-500">${r.category}</td>
                    <td class="p-2.5 font-mono text-red-700 font-semibold">${Number(r.current_stock).toFixed(1)} ${r.unit}</td>
                    <td class="p-2.5 font-mono text-gray-600">${r.reorder_level} ${r.unit}</td>
                    <td class="p-2.5 font-mono font-black text-[#e85d04]">${Number(r.suggested_reorder_qty).toFixed(1)} ${r.unit}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${isFarm ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">
                            ${r.procurement_source || 'Purchase at Market'}
                        </span>
                    </td>
                    <td class="p-2.5 font-mono text-gray-700">KES ${unitPrice.toFixed(2)}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-[#0b3b2c]">KES ${Number(r.estimated_cost).toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        budgetElem.textContent = `Estimated Market Budget: KES ${totalEst.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    }

    // --------------------------------------------------------------------------
    // 10. STOCK BALANCES, MOVEMENT LEDGER & ASSETS
    // --------------------------------------------------------------------------
    async function loadStockBalances() {
        const tbody = document.getElementById('balances-table-body');
        let query = supabase.from('current_stock_balances').select('*').order('item_name');

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            query = query.eq('dept_code', currentUserDeptCode);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedBalances = data || [];
        renderStockBalancesTable();
    }

    function renderStockBalancesTable() {
        const tbody = document.getElementById('balances-table-body');
        const search = document.getElementById('filter-stock-search').value.toLowerCase();
        const dept = document.getElementById('filter-stock-dept').value;
        const cat = document.getElementById('filter-stock-category').value;
        const health = document.getElementById('filter-stock-health').value;

        const filtered = cachedBalances.filter(r => {
            const matchesSearch = !search || r.item_name.toLowerCase().includes(search);
            const matchesDept = dept === 'ALL' || r.dept_code === dept;
            const matchesCat = cat === 'ALL' || r.category === cat;
            const isLow = r.balance <= r.reorder_level;
            const matchesHealth = health === 'ALL' || (health === 'LOW' ? isLow : !isLow);

            return matchesSearch && matchesDept && matchesCat && matchesHealth;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-gray-400">No stock balances match criteria.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(r => {
            const isLow = r.balance <= r.reorder_level;
            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-3 font-semibold text-gray-900">${r.item_name}</td>
                    <td class="p-3 text-xs text-gray-500">${r.category}</td>
                    <td class="p-3 text-xs font-medium text-[#0b3b2c]">${r.department_name}</td>
                    <td class="p-3 font-mono font-bold text-sm ${isLow ? 'text-red-600' : 'text-[#0b3b2c]'}">
                        ${Number(r.balance).toFixed(2)} <span class="text-xs font-normal text-gray-500">${r.unit}</span>
                    </td>
                    <td class="p-3 font-mono text-xs text-gray-700">KES ${Number(r.standard_cost || 0).toFixed(2)}</td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${isLow ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                            ${isLow ? '⚠️ Low Stock' : '✓ Healthy'}
                        </span>
                    </td>
                    <td class="p-3 text-right">
                        ${r.is_perishable ? '<span class="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-900 font-semibold">Perishable</span>' : '<span class="text-gray-400 text-xs">—</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function loadLedgerRecords() {
        const tbody = document.getElementById('ledger-table-body');
        let query = supabase.from('stock_movements')
            .select('*, items(name, unit), departments(name, dept_code)')
            .order('created_at', { ascending: false })
            .limit(150);

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            const dept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (dept) query = query.eq('department_id', dept.id);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedMovements = data || [];
        renderLedgerTable();
    }

    function renderLedgerTable() {
        const tbody = document.getElementById('ledger-table-body');
        const search = document.getElementById('filter-ledger-search').value.toLowerCase();
        const moveType = document.getElementById('filter-ledger-type').value;
        const dept = document.getElementById('filter-ledger-dept').value;
        const dateVal = document.getElementById('filter-ledger-date').value;

        const filtered = cachedMovements.filter(m => {
            const matchesSearch = !search || 
                (m.items?.name && m.items.name.toLowerCase().includes(search)) ||
                (m.performed_by_name && m.performed_by_name.toLowerCase().includes(search)) ||
                (m.reason && m.reason.toLowerCase().includes(search));

            const matchesType = moveType === 'ALL' || m.movement_type === moveType;
            const matchesDept = dept === 'ALL' || m.departments?.dept_code === dept;
            const matchesDate = !dateVal || m.created_at.startsWith(dateVal);

            return matchesSearch && matchesType && matchesDept && matchesDate;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-gray-400">No ledger records match filters.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(m => {
            const dateStr = new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
            const isIn = m.direction === 'In';
            return `
                <tr class="hover:bg-gray-50 border-b">
                    <td class="p-2.5 text-gray-500 whitespace-nowrap">${dateStr}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                            m.movement_type === 'Top-up' ? 'bg-orange-100 text-orange-800' :
                            isIn ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
                        }">
                            ${m.movement_type}
                        </span>
                    </td>
                    <td class="p-2.5 font-bold">${m.items?.name || 'Item'}</td>
                    <td class="p-2.5 text-xs text-gray-600">${m.departments?.name || 'Central'}</td>
                    <td class="p-2.5 font-mono font-bold ${isIn ? 'text-green-700' : 'text-red-700'}">
                        ${isIn ? '+' : '-'}${m.quantity} ${m.items?.unit || ''}
                    </td>
                    <td class="p-2.5 text-xs text-gray-700">
                        ${m.reason_category ? `<strong>[${m.reason_category}]</strong> ` : ''}
                        ${m.reason || ''} 
                        ${m.people_count ? `(${m.people_count} people)` : ''}
                    </td>
                    <td class="p-2.5 text-xs text-gray-700 font-medium">
                        ${m.performed_by_name} <br>
                        <span class="text-gray-400 font-mono text-[10px]">${m.performed_by_email || m.performed_by_dept}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function loadDonationRegister() {
        const tbody = document.getElementById('donations-table-body');
        const { data, error } = await supabase.from('donation_register_view').select('*').order('date_received', { ascending: false });

        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedDonations = data || [];
        renderDonationsTable();
    }

    function renderDonationsTable() {
        const tbody = document.getElementById('donations-table-body');
        const search = document.getElementById('filter-donations-search').value.toLowerCase();
        const intent = document.getElementById('filter-donations-intent').value;
        const status = document.getElementById('filter-donations-status').value;

        const filtered = cachedDonations.filter(d => {
            const matchesSearch = !search || 
                d.donation_ref.toLowerCase().includes(search) || 
                d.donor_name.toLowerCase().includes(search) ||
                d.item_name.toLowerCase().includes(search);

            const matchesIntent = intent === 'ALL' || (intent === 'Unrestricted' ? d.donor_intent === 'Unrestricted' : d.donor_intent !== 'Unrestricted');
            const hasRemaining = d.remaining_balance > 0;
            const matchesStatus = status === 'ALL' || (status === 'AVAILABLE' ? hasRemaining : !hasRemaining);

            return matchesSearch && matchesIntent && matchesStatus;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-gray-400">No donations match filters.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(d => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-mono font-bold text-orange-950">${d.donation_ref}</td>
                <td class="p-2.5 font-medium">${d.donor_name}</td>
                <td class="p-2.5">${d.item_name}</td>
                <td class="p-2.5 text-xs font-semibold ${d.donor_intent === 'Unrestricted' ? 'text-emerald-700' : 'text-blue-700'}">${d.donor_intent}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 font-medium">${d.item_condition || 'Good'}</span></td>
                <td class="p-2.5 font-mono text-green-700">${Number(d.total_received).toFixed(1)} ${d.unit}</td>
                <td class="p-2.5 font-mono text-red-700">${Number(d.total_used).toFixed(1)} ${d.unit}</td>
                <td class="p-2.5 font-mono font-bold text-[#0b3b2c]">${Number(d.remaining_balance).toFixed(1)} ${d.unit}</td>
            </tr>
        `).join('');
    }

    async function loadAssets() {
        const tbody = document.getElementById('assets-table-body');
        let query = supabase.from('assets').select('*, departments(name, dept_code)').order('created_at', { ascending: false });

        if (currentUserDeptCode !== 'AD001' && currentUserDeptCode !== 'ST001') {
            const dept = cachedDepts.find(d => d.dept_code === currentUserDeptCode);
            if (dept) query = query.eq('department_id', dept.id);
        }

        const { data, error } = await query;
        if (error) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedAssets = data || [];
        renderAssetsTable();
    }

    function renderAssetsTable() {
        const tbody = document.getElementById('assets-table-body');
        const search = document.getElementById('filter-assets-search').value.toLowerCase();
        const dept = document.getElementById('filter-assets-dept').value;
        const condition = document.getElementById('filter-assets-condition').value;
        const acq = document.getElementById('filter-assets-acq').value;

        const filtered = cachedAssets.filter(a => {
            const matchesSearch = !search || 
                a.item_name.toLowerCase().includes(search) || 
                (a.custodian && a.custodian.toLowerCase().includes(search)) ||
                (a.tag_or_serial && a.tag_or_serial.toLowerCase().includes(search));
            const matchesDept = dept === 'ALL' || a.departments?.dept_code === dept;
            const matchesCond = condition === 'ALL' || a.condition === condition;
            const matchesAcq = acq === 'ALL' || a.acquisition_type === acq;
            return matchesSearch && matchesDept && matchesCond && matchesAcq;
        });

        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">No matching assets found.</td></tr>';
            return;
        }

        tbody.innerHTML = filtered.map(a => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-bold text-[#0b3b2c]">${a.item_name}</td>
                <td class="p-2.5 text-xs text-gray-600">${a.departments?.name || 'Central'}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 font-medium">${a.acquisition_type}</span></td>
                <td class="p-2.5">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${
                        a.condition === 'Good' ? 'bg-green-100 text-green-800' :
                        a.condition === 'Fair' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                    }">${a.condition}</span>
                </td>
                <td class="p-2.5 text-xs">${a.storage_location}</td>
                <td class="p-2.5 text-xs font-medium">${a.custodian}</td>
                <td class="p-2.5 text-xs font-mono text-gray-500">${a.tag_or_serial || '—'}</td>
                <td class="p-2.5 text-xs text-gray-600">${a.performed_by_name} <span class="text-gray-400">(${a.performed_by_email})</span></td>
            </tr>
        `).join('');
    }

    async function loadStaffAccounts() {
        if (currentUserDeptCode !== 'AD001') return;

        const tbody = document.getElementById('staff-table-body');
        const { data, error } = await supabase.from('staff_profiles').select('*').order('dept_code');

        if (error) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-red-500">Error: ${error.message}</td></tr>`;
            return;
        }

        cachedStaff = data || [];
        tbody.innerHTML = cachedStaff.map(s => `
            <tr class="hover:bg-gray-50 border-b">
                <td class="p-2.5 font-mono font-bold text-emerald-950">${s.dept_code}</td>
                <td class="p-2.5 font-semibold text-gray-800">${s.staff_name}</td>
                <td class="p-2.5 text-gray-600 font-mono">${s.email}</td>
                <td class="p-2.5"><span class="px-2 py-0.5 rounded text-xs bg-gray-100 font-medium">${s.role}</span></td>
                <td class="p-2.5">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${s.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${s.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="p-2.5 text-right space-x-1">
                    <button onclick="window.editStaffMember('${s.id}')" class="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-gray-700">Edit</button>
                    <button onclick="window.toggleStaffStatus('${s.id}', ${s.is_active})" class="text-xs ${s.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'} px-2 py-1 rounded">
                        ${s.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function setupFilters() {
        ['filter-stock-search', 'filter-stock-dept', 'filter-stock-category', 'filter-stock-health'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderStockBalancesTable);
        });

        ['filter-ledger-search', 'filter-ledger-type', 'filter-ledger-dept', 'filter-ledger-date'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderLedgerTable);
        });

        ['filter-donations-search', 'filter-donations-intent', 'filter-donations-status'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderDonationsTable);
        });

        ['filter-assets-search', 'filter-assets-dept', 'filter-assets-condition', 'filter-assets-acq'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', renderAssetsTable);
        });
    }

    function refreshAllViews() {
        loadActionCentre();
        loadStockBalances();
        loadLedgerRecords();
        loadDonationRegister();
        loadAssets();
        loadReplenishmentList();
        loadDonorsDirectory();
        if (currentUserDeptCode === 'AD001') loadStaffAccounts();
    }

    // --------------------------------------------------------------------------
    // 11. EXPORTS
    // --------------------------------------------------------------------------
    function downloadCSV(csvContent, fileName) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    document.getElementById('btn-export-stock').addEventListener('click', async () => {
        const { data } = await supabase.from('current_stock_balances').select('*');
        if (!data || !data.length) return alert('No stock data to export.');

        let csv = 'Item Name,Category,Department,Balance,Unit,Reorder Level,Current Price\n';
        data.forEach(r => {
            csv += `"${r.item_name}","${r.category}","${r.department_name}",${r.balance},"${r.unit}",${r.reorder_level},${r.standard_cost}\n`;
        });
        downloadCSV(csv, `Amys_House_Stock_Balances_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-ledger').addEventListener('click', async () => {
        const { data } = await supabase.from('stock_movements').select('*, items(name, unit), departments(name)');
        if (!data || !data.length) return alert('No movements to export.');

        let csv = 'Timestamp,Movement Type,Direction,Item,Quantity,Unit,Department,Reason,Operator Name,Operator Account\n';
        data.forEach(m => {
            csv += `"${m.created_at}","${m.movement_type}","${m.direction}","${m.items?.name}",${m.quantity},"${m.items?.unit}","${m.departments?.name}","${m.reason || ''}","${m.performed_by_name}","${m.performed_by_email}"\n`;
        });
        downloadCSV(csv, `Amys_House_Audit_Ledger_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-donations').addEventListener('click', async () => {
        const { data } = await supabase.from('donation_register_view').select('*');
        if (!data || !data.length) return alert('No donations to export.');

        let csv = 'Ref No,Donor,Item,Intent,Condition,Total Received,Total Used,Remaining,Unit\n';
        data.forEach(d => {
            csv += `"${d.donation_ref}","${d.donor_name}","${d.item_name}","${d.donor_intent}","${d.item_condition}",${d.total_received},${d.total_used},${d.remaining_balance},"${d.unit}"\n`;
        });
        downloadCSV(csv, `Amys_House_Donation_Register_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('btn-export-assets').addEventListener('click', async () => {
        const { data } = await supabase.from('assets').select('*, departments(name)');
        if (!data || !data.length) return alert('No assets to export.');

        let csv = 'Asset Name,Department,Acquisition,Condition,Cost Value,Location,Custodian,Tag Serial,Logged By\n';
        data.forEach(a => {
            csv += `"${a.item_name}","${a.departments?.name}","${a.acquisition_type}","${a.condition}",${a.cost_or_value},"${a.storage_location}","${a.custodian}","${a.tag_or_serial || ''}","${a.performed_by_name}"\n`;
        });
        downloadCSV(csv, `Amys_House_Assets_${new Date().toISOString().slice(0,10)}.csv`);
    });

    // --------------------------------------------------------------------------
    // 12. ONLINE / OFFLINE STATUS
    // --------------------------------------------------------------------------
    const syncStatus = document.getElementById('sync-status');
    window.addEventListener('online', () => {
        syncStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Online';
        syncStatus.className = 'bg-emerald-800 border border-emerald-600 px-2.5 py-1 rounded-full text-emerald-100 flex items-center gap-1.5';
    });
    window.addEventListener('offline', () => {
        syncStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Offline (Cached)';
        syncStatus.className = 'bg-amber-800 border border-amber-600 px-2.5 py-1 rounded-full text-amber-100 flex items-center gap-1.5';
    });
});
