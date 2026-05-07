const supabaseUrl = 'https://opszvifybrteqdfozbkr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wc3p2aWZ5YnJ0ZXFkZm96YmtyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTQ5MzQsImV4cCI6MjA5MzU5MDkzNH0.cToJ5sLDcXGgDfJS2o_Ww-fwb69FaUgS4rriQfiGjeI';

let _db, inventory = [], customers = [], queue = [], editingProdId = null;

document.addEventListener('DOMContentLoaded', () => {
    _db = supabase.createClient(supabaseUrl, supabaseKey);
    loadData();
});

async function loadData() {
    const resP = await _db.from('products').select('*').order('name');
    const resC = await _db.from('customers').select('*').order('updated_at', { ascending: false });
    inventory = resP.data || [];
    customers = resC.data || [];
    renderUI();
}

// Global functions for HTML access
window.saveProduct = async function() {
    const dozens = parseFloat(document.getElementById('p-dozens').value) || 0;
    const priceNaira = parseFloat(document.getElementById('p-naira').value) || 0;
    const sellCfa = parseFloat(document.getElementById('p-sell').value) || 0;
    const payload = {
        "batch_name": document.getElementById('p-batch').value,
        "name": document.getElementById('p-name').value,
        "dozens": dozens, "price_naira": priceNaira,
        "cost_cfa": parseFloat(document.getElementById('p-cfa').value) || 0,
        "sell_price_cfa": sellCfa, "total_naira": dozens * priceNaira,
        "total_expected_cfa": dozens * sellCfa
    };
    let res = editingProdId ? await _db.from('products').update(payload).eq('id', editingProdId) : await _db.from('products').insert([payload]);
    if (res.error) alert(res.error.message); else { clearProductForm(); loadData(); }
};

window.editProduct = (id) => {
    const p = inventory.find(x => x.id === id);
    if (!p) return;
    editingProdId = id;
    document.getElementById('p-title').innerText = "📝 Edit " + p.name;
    document.getElementById('p-batch').value = p.batch_name;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-dozens').value = p.dozens;
    document.getElementById('p-naira').value = p.price_naira;
    document.getElementById('p-cfa').value = p.cost_cfa;
    document.getElementById('p-sell').value = p.sell_price_cfa;
    document.getElementById('p-cancel').classList.remove('hidden');
};

window.addToQueue = () => {
    const pName = document.getElementById('sale-prod').value;
    const qty = parseFloat(document.getElementById('sale-qty').value) || 0;
    const p = inventory.find(x => x.name === pName);
    if (p && qty > 0) {
        queue.push({ id: p.id, name: p.name, qty: qty, price: p.sell_price_cfa });
        document.getElementById('sale-queue').innerHTML = queue.map(i => `<div>• ${i.qty} ${i.name}</div>`).join('');
        document.getElementById('sale-prod').value = ''; document.getElementById('sale-qty').value = '';
    }
};

window.saveCustomer = async function() {
    const name = document.getElementById('c-name').value;
    const phone = document.getElementById('c-phone').value;
    const paid = parseFloat(document.getElementById('c-paid').value) || 0;
    const total = queue.reduce((sum, item) => sum + (item.qty * item.price), 0);

    if (!name || queue.length === 0) return alert("Missing info!");

    const { error } = await _db.from('customers').insert([{
        name, phone, items_json: queue, total_amount: total, amount_paid: paid, balance: total - paid, updated_at: new Date().toISOString()
    }]);

    if (!error) {
        for (let item of queue) {
            const p = inventory.find(x => x.id === item.id);
            await _db.from('products').update({ sold_units: (p.sold_units || 0) + item.qty }).eq('id', item.id);
        }
        queue = []; document.getElementById('sale-queue').innerHTML = 'Queue empty...';
        document.getElementById('c-name').value = ''; document.getElementById('c-phone').value = ''; document.getElementById('c-paid').value = '';
        loadData();
    }
};

window.editCustomerPayment = async function(id) {
    const c = customers.find(x => x.id === id);
    const newPaid = prompt(`Update Total Payment for ${c.name}:`, c.amount_paid);
    if (newPaid !== null) {
        const val = parseFloat(newPaid) || 0;
        await _db.from('customers').update({ amount_paid: val, balance: c.total_amount - val, updated_at: new Date().toISOString() }).eq('id', id);
        loadData();
    }
};

window.deleteCustomer = async function(id) {
    const c = customers.find(x => x.id === id);
    if (confirm("Delete record and return items to stock?")) {
        if (c.items_json) {
            for (let item of c.items_json) {
                const p = inventory.find(x => x.id === item.id);
                if (p) await _db.from('products').update({ sold_units: Math.max(0, (p.sold_units || 0) - item.qty) }).eq('id', p.id);
            }
        }
        await _db.from('customers').delete().eq('id', id);
        loadData();
    }
};

function renderUI() {
    // Totals logic remains same as before...
    const tNaira = inventory.reduce((s, p) => s + (p.total_naira || 0), 0);
    const tCfa = inventory.reduce((s, p) => s + ((p.dozens || 0) * (p.cost_cfa || 0)), 0);
    const eCfa = inventory.reduce((s, p) => s + (p.total_expected_cfa || 0), 0);
    const debt = customers.reduce((s, c) => s + (c.balance || 0), 0);

    document.getElementById('total-naira').innerText = "₦" + tNaira.toLocaleString();
    document.getElementById('total-cfa').innerText = tCfa.toLocaleString() + " CFA";
    document.getElementById('expected-cfa').innerText = eCfa.toLocaleString() + " CFA";
    document.getElementById('total-debt').innerText = debt.toLocaleString() + " CFA";

    // Update Tables
    document.getElementById('p-list').innerHTML = inventory.map(i => `<option value="${i.name}">`).join('');
    
    document.getElementById('inventory-table').innerHTML = inventory.map(p => `
        <tr class="border-b border-gray-800 hover:bg-gray-900">
            <td class="p-4"><span class="text-xs text-gray-500">${p.batch_name}</span><br><strong>${p.name}</strong></td>
            <td class="p-4">${((p.dozens || 0) - (p.sold_units || 0)).toFixed(1)} <small>Doz</small></td>
            <td class="p-4 text-right font-mono">${(p.sell_price_cfa || 0).toLocaleString()}</td>
            <td class="p-4 text-center"><button onclick="editProduct(${p.id})" class="text-blue-400">Edit</button></td>
        </tr>`).join('');

    document.getElementById('customer-table').innerHTML = customers.map(c => {
        // Format the Item List for display
        const itemsList = (c.items_json || []).map(i => `${i.qty}x ${i.name}`).join(', ');
        // Format Date
        const date = new Date(c.updated_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

        return `
        <tr class="border-b border-gray-800 hover:bg-gray-900">
            <td class="p-4">
                <strong>${c.name}</strong><br>
                <small class="text-yellow-600 italic text-xs">${itemsList || 'No items'}</small>
            </td>
            <td class="p-4 text-gray-400 font-mono text-xs">${c.phone || 'N/A'}</td>
            <td class="p-4 text-gray-500 text-xs">${date}</td>
            <td class="p-4 text-right font-mono">${(c.total_amount || 0).toLocaleString()}</td>
            <td class="p-4 text-right font-bold ${c.balance > 0 ? 'text-red-500' : 'text-green-500'} font-mono">${(c.balance || 0).toLocaleString()}</td>
            <td class="p-4 text-center space-x-2">
                <button onclick="editCustomerPayment(${c.id})" class="bg-yellow-600 text-black px-2 py-1 rounded text-xs font-bold">PAY</button>
                <button onclick="deleteCustomer(${c.id})" class="text-red-900 text-xs">DEL</button>
            </td>
        </tr>`;
    }).join('');
}

window.clearProductForm = () => {
    editingProdId = null;
    ['p-batch','p-name','p-dozens','p-naira','p-cfa','p-sell'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('p-title').innerText = "📦 Stock Entry";
    document.getElementById('p-cancel').classList.add('hidden');
};
