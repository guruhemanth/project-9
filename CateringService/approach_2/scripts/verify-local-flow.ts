import axios from 'axios';

const BASE_URL = 'http://localhost:8080/api';

async function runLocalTest() {
  console.log('===========================================================');
  console.log('🚀 RUNNING LOCAL END-TO-END VERIFICATION: CUSTOMER IDENTIFICATION 🚀');
  console.log('===========================================================');

  // 1. Customer Login
  console.log('\n[1] Logging in as Customer (customer@example.com)...');
  const custLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'customer@example.com',
    password: 'Password123!',
  });
  const custToken = custLoginRes.data.token;
  const custUser = custLoginRes.data.user;
  console.log('✓ Customer logged in:');
  console.log(`  - User ID: ${custUser.id}`);
  console.log(`  - Full Name: ${custUser.fullName}`);
  console.log(`  - Phone: ${custUser.phone}`);
  console.log(`  - Role: ${custUser.role}`);

  // 2. Caterer Login
  console.log('\n[2] Logging in as Caterer (caterer@example.com)...');
  const catLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'caterer@example.com',
    password: 'Password123!',
  });
  const catToken = catLoginRes.data.token;
  const catUser = catLoginRes.data.user;
  console.log('✓ Caterer logged in:');
  console.log(`  - User ID: ${catUser.id}`);
  console.log(`  - Role: ${catUser.role}`);

  // Verify caterer business in DB
  const catererId = 'd0000000-0000-0000-0000-000000000001';
  const catererRes = await axios.get(`${BASE_URL}/caterers/${catererId}`);
  console.log(`  - Business Name: ${catererRes.data.caterer.business_name} (ID: ${catererId})`);

  // 3. Customer submits a new booking request
  console.log('\n[3] Customer submitting booking request...');
  const createBookingPayload = {
    catererId,
    packageId: 'e0000000-0000-0000-0000-000000000001',
    eventDate: '2026-12-25',
    eventTime: '12:30',
    guestCount: 200,
    venueAddress: 'Govinda Nilayam, Gandhi Road, Tirupati, AP',
    city: 'Tirupati',
    state: 'Andhra Pradesh',
    pincode: '517501',
    specialRequests: 'Local end-to-end customer identification check',
  };

  const bookingRes = await axios.post(`${BASE_URL}/bookings`, createBookingPayload, {
    headers: { Authorization: `Bearer ${custToken}` },
  });
  const newBooking = bookingRes.data.booking;
  console.log('✓ Booking created successfully:');
  console.log(`  - Booking ID: ${newBooking.id}`);
  console.log(`  - Status: ${newBooking.status}`);
  console.log(`  - Guest Count: ${newBooking.guest_count}`);
  console.log(`  - Total Amount: ₹${newBooking.total_amount / 100}`);

  // 4. Caterer views incoming requests queue
  console.log('\n[4] Caterer fetching bookings from /api/bookings/caterer/:catererId ...');
  const catererBookingsRes = await axios.get(`${BASE_URL}/bookings/caterer/${catererId}`, {
    headers: { Authorization: `Bearer ${catToken}` },
  });

  const bookingsList = catererBookingsRes.data.bookings || [];
  const foundBooking = bookingsList.find((b: any) => b.id === newBooking.id);
  if (!foundBooking) {
    throw new Error(`Booking ${newBooking.id} not found in caterer bookings list!`);
  }

  console.log('✓ Found booking in Caterer Incoming Queue:');
  console.log(`  - Booking ID: ${foundBooking.id}`);
  console.log(`  - Status: ${foundBooking.status}`);
  console.log(`  - Customer Name: ${foundBooking.customer_name}`);
  console.log(`  - Customer Phone: ${foundBooking.customer_phone}`);
  console.log(`  - Customer Email: ${foundBooking.customer_email}`);

  if (!foundBooking.customer_name || !foundBooking.customer_phone) {
    throw new Error('FAILED: customer_name or customer_phone is null/missing in caterer bookings list!');
  }
  console.log('✓ VERIFIED: Customer details are clearly visible to Caterer on incoming request!');

  // 5. Caterer views single booking details
  console.log(`\n[5] Caterer fetching single booking details /api/bookings/${newBooking.id} ...`);
  const singleRes = await axios.get(`${BASE_URL}/bookings/${newBooking.id}`, {
    headers: { Authorization: `Bearer ${catToken}` },
  });
  const single = singleRes.data.booking;
  console.log('✓ Single Booking Details:');
  console.log(`  - Customer Name: ${single.customer_name}`);
  console.log(`  - Customer Phone: ${single.customer_phone}`);
  console.log(`  - Customer Email: ${single.customer_email}`);

  if (!single.customer_name || !single.customer_phone) {
    throw new Error('FAILED: customer_name or customer_phone missing in single booking view!');
  }

  // 6. Caterer accepts the booking request
  console.log(`\n[6] Caterer accepting booking ${newBooking.id}...`);
  const acceptRes = await axios.post(
    `${BASE_URL}/bookings/${newBooking.id}/accept`,
    { catererNote: 'We are delighted to cater your event!' },
    { headers: { Authorization: `Bearer ${catToken}` } }
  );
  console.log('✓ Booking accepted successfully!');
  console.log(`  - New Status: ${acceptRes.data.booking.status}`);
  console.log(`  - Caterer Note: ${acceptRes.data.booking.caterer_note}`);

  // 7. Re-fetch caterer bookings to check Active Bookings list
  console.log('\n[7] Re-fetching caterer bookings to verify Active Bookings view...');
  const updatedBookingsRes = await axios.get(`${BASE_URL}/bookings/caterer/${catererId}`, {
    headers: { Authorization: `Bearer ${catToken}` },
  });
  const updatedList = updatedBookingsRes.data.bookings || [];
  const activeBooking = updatedList.find((b: any) => b.id === newBooking.id);
  console.log('✓ Active Booking verified:');
  console.log(`  - Booking ID: ${activeBooking.id}`);
  console.log(`  - Status: ${activeBooking.status}`);
  console.log(`  - Customer Name: ${activeBooking.customer_name}`);
  console.log(`  - Customer Phone: ${activeBooking.customer_phone}`);

  if (!activeBooking.customer_name || !activeBooking.customer_phone) {
    throw new Error('FAILED: customer_name or customer_phone missing on accepted active booking!');
  }

  console.log('\n===========================================================');
  console.log('🎉 ALL LOCAL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('   - Customer name & phone properly joined from auth_svc.users');
  console.log('   - Correctly returned by booking-order service');
  console.log('   - Caterer can identify customer before & after acceptance');
  console.log('===========================================================\n');
}

runLocalTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.response?.data || err.message);
  process.exit(1);
});
