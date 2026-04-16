#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class MKEPulseAPITester:
    def __init__(self, base_url="https://brewers-events.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.session = requests.Session()

    def run_test(self, name, method, endpoint, expected_status, data=None, use_admin=False):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        # Use admin token if specified
        token_to_use = self.admin_token if use_admin else self.token
        if token_to_use:
            headers['Authorization'] = f'Bearer {token_to_use}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        if use_admin:
            print(f"   Using admin token: {self.admin_token[:20] if self.admin_token else 'None'}...")
        
        try:
            # Use a fresh session for admin requests to avoid cookie conflicts
            session_to_use = requests.Session() if use_admin else self.session
            
            if method == 'GET':
                response = session_to_use.get(url, headers=headers)
            elif method == 'POST':
                response = session_to_use.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = session_to_use.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = session_to_use.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 500:
                        print(f"   Response: {json.dumps(response_data, indent=2)}")
                except:
                    pass
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Raw response: {response.text[:200]}")

            return success, response.json() if response.content else {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health(self):
        """Test health endpoint"""
        success, response = self.run_test("Health Check", "GET", "api/health", 200)
        return success

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "admin@mkepulse.com", "password": "MKEadmin2026!"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
            return True
        return False

    def test_register_user(self):
        """Test user registration"""
        test_email = f"test_user_{datetime.now().strftime('%H%M%S')}@test.com"
        success, response = self.run_test(
            "User Registration",
            "POST",
            "api/auth/register",
            200,
            data={"email": test_email, "password": "TestPass123!", "name": "Test User"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   User token obtained: {self.token[:20]}...")
            return True
        return False

    def test_auth_me(self):
        """Test auth/me endpoint"""
        success, response = self.run_test("Auth Me", "GET", "api/auth/me", 200)
        return success

    def test_feed(self):
        """Test feed endpoint"""
        success, response = self.run_test("Feed", "GET", "api/feed", 200)
        if success:
            events = response.get('events', [])
            print(f"   Found {len(events)} events")
            if len(events) >= 8:
                print("   ✅ Expected 8+ events found")
            else:
                print(f"   ⚠️  Expected 8+ events, got {len(events)}")
        return success

    def test_parking(self):
        """Test parking endpoint"""
        success, response = self.run_test("Parking", "GET", "api/parking", 200)
        if success:
            garages = response.get('garages', [])
            print(f"   Found {len(garages)} garages")
            if len(garages) >= 6:
                print("   ✅ Expected 6+ garages found")
            else:
                print(f"   ⚠️  Expected 6+ garages, got {len(garages)}")
        return success

    def test_alerts(self):
        """Test alerts endpoint"""
        success, response = self.run_test("Alerts", "GET", "api/alerts", 200)
        if success:
            alerts = response.get('alerts', [])
            print(f"   Found {len(alerts)} alerts")
        return success

    def test_preferences(self):
        """Test preferences endpoints"""
        # Get preferences
        success1, response1 = self.run_test("Get Preferences", "GET", "api/preferences", 200)
        
        # Save preferences
        success2, response2 = self.run_test(
            "Save Preferences",
            "POST",
            "api/preferences",
            200,
            data={
                "categories": ["concerts", "food"],
                "budget_max": 50,
                "neighborhoods": ["downtown"],
                "group_type": "friends",
                "age_filter": "all",
                "notif_frequency": "smart",
                "geo_radius_miles": 3.0,
                "display_name": "Test User Updated"
            }
        )
        
        return success1 and success2

    def test_admin_dashboard(self):
        """Test admin dashboard"""
        if not self.admin_token:
            print("   ⚠️  No admin token available")
            return False
        success, response = self.run_test("Admin Dashboard", "GET", "api/admin/dashboard", 200, use_admin=True)
        if success:
            stats = response.get('stats', {})
            print(f"   Stats: {stats}")
        return success

    def test_admin_users(self):
        """Test admin users endpoint"""
        if not self.admin_token:
            print("   ⚠️  No admin token available")
            return False
        success, response = self.run_test("Admin Users", "GET", "api/admin/users", 200, use_admin=True)
        if success:
            users = response.get('users', [])
            print(f"   Found {len(users)} users")
        return success

    def test_admin_events(self):
        """Test admin events endpoint"""
        if not self.admin_token:
            print("   ⚠️  No admin token available")
            return False
        success, response = self.run_test("Admin Events", "GET", "api/admin/events", 200, use_admin=True)
        if success:
            events = response.get('events', [])
            print(f"   Found {len(events)} events")
        return success

    def test_admin_alerts(self):
        """Test admin alerts endpoint"""
        if not self.admin_token:
            print("   ⚠️  No admin token available")
            return False
        success, response = self.run_test("Admin Alerts", "GET", "api/admin/alerts", 200, use_admin=True)
        if success:
            alerts = response.get('alerts', [])
            print(f"   Found {len(alerts)} alerts")
        return success

    def test_admin_parking(self):
        """Test admin parking endpoint"""
        if not self.admin_token:
            print("   ⚠️  No admin token available")
            return False
        success, response = self.run_test("Admin Parking", "GET", "api/admin/parking", 200, use_admin=True)
        if success:
            garages = response.get('garages', [])
            print(f"   Found {len(garages)} garages")
        return success

    def test_admin_revenue(self):
        """Test admin revenue endpoint"""
        if not self.admin_token:
            print("   ⚠️  No admin token available")
            return False
        success, response = self.run_test("Admin Revenue", "GET", "api/admin/revenue", 200, use_admin=True)
        if success:
            mrr = response.get('mrr', 0)
            print(f"   MRR: ${mrr}")
        return success

    def test_logout(self):
        """Test logout"""
        success, response = self.run_test("Logout", "POST", "api/auth/logout", 200)
        return success

    def test_free_user_login(self):
        """Test free user login"""
        success, response = self.run_test(
            "Free User Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "free@mkepulse.com", "password": "FreeUser2026!"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Free user token obtained: {self.token[:20]}...")
            return True
        return False

    def test_pro_user_login(self):
        """Test pro user login"""
        success, response = self.run_test(
            "Pro User Login",
            "POST",
            "api/auth/login",
            200,
            data={"email": "pro@mkepulse.com", "password": "ProUser2026!"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Pro user token obtained: {self.token[:20]}...")
            return True
        return False

    def test_geo_update_free_user(self):
        """Test geo update with free user - should return pro_required"""
        # First login as free user
        if not self.test_free_user_login():
            print("   ❌ Failed to login as free user")
            return False
        
        success, response = self.run_test(
            "Geo Update (Free User)",
            "POST",
            "api/geo/update",
            200,
            data={"lat": 43.04, "lng": -87.91}
        )
        if success:
            if response.get('reason') == 'pro_required' and not response.get('checked'):
                print("   ✅ Correctly returned pro_required for free user")
                return True
            else:
                print(f"   ❌ Expected pro_required, got: {response}")
                return False
        return False

    def test_geo_update_pro_user(self):
        """Test geo update with pro user - should return alerts"""
        # First login as pro user
        if not self.test_pro_user_login():
            print("   ❌ Failed to login as pro user")
            return False
        
        success, response = self.run_test(
            "Geo Update (Pro User)",
            "POST",
            "api/geo/update",
            200,
            data={"lat": 43.04, "lng": -87.91}
        )
        if success:
            if response.get('checked') and 'alerts_count' in response:
                print(f"   ✅ Pro user geo update successful, found {response.get('alerts_count', 0)} alerts")
                return True
            else:
                print(f"   ❌ Expected checked=True with alerts, got: {response}")
                return False
        return False

    def test_stripe_checkout(self):
        """Test Stripe checkout creation"""
        # Use free user for checkout
        if not self.test_free_user_login():
            print("   ❌ Failed to login as free user")
            return False
        
        success, response = self.run_test(
            "Stripe Checkout",
            "POST",
            "api/stripe/checkout",
            200,
            data={"origin_url": "https://brewers-events.preview.emergentagent.com"}
        )
        if success:
            if 'url' in response and 'session_id' in response:
                print(f"   ✅ Checkout session created with URL: {response['url'][:50]}...")
                return True
            else:
                print(f"   ❌ Expected url and session_id, got: {response}")
                return False
        return False

    def test_stripe_subscription_status(self):
        """Test Stripe subscription status"""
        success, response = self.run_test(
            "Stripe Subscription Status",
            "GET",
            "api/stripe/subscription",
            200
        )
        if success:
            if 'tier' in response and 'is_pro' in response:
                print(f"   ✅ Subscription status: tier={response.get('tier')}, is_pro={response.get('is_pro')}")
                return True
            else:
                print(f"   ❌ Expected tier and is_pro fields, got: {response}")
                return False
        return False

def main():
    print("🚀 Starting MKEpulse API Testing")
    print("=" * 50)
    
    tester = MKEPulseAPITester()
    
    # Test sequence
    tests = [
        ("Health Check", tester.test_health),
        ("Admin Login", tester.test_admin_login),
        ("User Registration", tester.test_register_user),
        ("Auth Me", tester.test_auth_me),
        ("Feed", tester.test_feed),
        ("Parking", tester.test_parking),
        ("Alerts", tester.test_alerts),
        ("Preferences", tester.test_preferences),
        ("Admin Dashboard", tester.test_admin_dashboard),
        ("Admin Users", tester.test_admin_users),
        ("Admin Events", tester.test_admin_events),
        ("Admin Alerts", tester.test_admin_alerts),
        ("Admin Parking", tester.test_admin_parking),
        ("Admin Revenue", tester.test_admin_revenue),
        # Phase 2 features
        ("Geo Update (Free User)", tester.test_geo_update_free_user),
        ("Geo Update (Pro User)", tester.test_geo_update_pro_user),
        ("Stripe Checkout", tester.test_stripe_checkout),
        ("Stripe Subscription Status", tester.test_stripe_subscription_status),
        ("Logout", tester.test_logout),
    ]
    
    failed_tests = []
    
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} crashed: {e}")
            failed_tests.append(test_name)
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if failed_tests:
        print(f"❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())