#!/usr/bin/env python3

import requests
import json

# Test admin authentication specifically
base_url = "https://6e012e97-6085-40c8-b0fe-bb395e2e6d2e.preview.emergentagent.com"

print("Testing admin authentication...")

# Step 1: Login as admin
login_response = requests.post(f"{base_url}/api/auth/login", json={
    "email": "admin@mkepulse.com",
    "password": "MKEadmin2026!"
})

print(f"Login status: {login_response.status_code}")
if login_response.status_code == 200:
    login_data = login_response.json()
    print(f"Login response: {json.dumps(login_data, indent=2)}")
    
    admin_token = login_data.get('token')
    print(f"Admin token: {admin_token[:50]}...")
    
    # Step 2: Test auth/me with admin token
    headers = {'Authorization': f'Bearer {admin_token}'}
    me_response = requests.get(f"{base_url}/api/auth/me", headers=headers)
    print(f"Auth/me status: {me_response.status_code}")
    if me_response.status_code == 200:
        me_data = me_response.json()
        print(f"Auth/me response: {json.dumps(me_data, indent=2)}")
        
        # Step 3: Test admin dashboard
        dashboard_response = requests.get(f"{base_url}/api/admin/dashboard", headers=headers)
        print(f"Dashboard status: {dashboard_response.status_code}")
        if dashboard_response.status_code == 200:
            dashboard_data = dashboard_response.json()
            print(f"Dashboard response: {json.dumps(dashboard_data, indent=2)}")
        else:
            print(f"Dashboard error: {dashboard_response.text}")
    else:
        print(f"Auth/me error: {me_response.text}")
else:
    print(f"Login error: {login_response.text}")