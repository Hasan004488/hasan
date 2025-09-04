import pymongo
from datetime import date, datetime
import sys
from time import time
#from sklearn.feature_extraction.text import TfidfVectorizer
#from sklearn.linear_model import LogisticRegression


logs_to_scan = int(sys.argv[1])

start_time = time()
timeout_limit_seconds = 60





client = pymongo.MongoClient( "mongodb://mongo_admin:E171x0b98e30609be1f@localhost" )
my_db = client["eitix_dashboard"]
col_name = "uba.users"
my_collection = my_db[col_name]
cursor = my_collection.find(sort=[("_id", pymongo.DESCENDING)])

all_uba_users = []
for document in cursor:
	current_user_data = {}
	current_user_data["username"] = document["username"]
	current_user_data["usertype"] = document["type"]
	all_uba_users.append(current_user_data)


#print(all_uba_users)

def user_existance_check(siem_log):
	detected_users = []

	for each_user_dict in all_uba_users:
		if each_user_dict["username"] in siem_log.lower():
			found_user = {}
			found_user["username"] = each_user_dict["username"]
			found_user["type"] = each_user_dict["usertype"]
			detected_users.append(found_user)

	return detected_users






uba_detection_stages = {
			"Login Attempt": 1,
			"Failed Login": 2,
			"Successful Login": 3,
			"File Modified": 4,
			"File Accessed": 5,
			"File Deleted": 6,
			"Privilege Escalation": 7,
			"Resource Access": 8,
			"Network Anomaly": 9,
			"Data Download": 10,
			"Data Upload": 11,
			"Application Login": 12,
			"Unauthorized Access Attempt": 13,
			"Email Sent": 14,
			"Email Received": 15,
			"Account Locked": 16,
			"Session Timeout": 17,
			"Password Change": 18,
			"File Upload to Cloud": 19,
			"Suspicious Email Detected": 20,
			"Database Access": 21,
			"Database Modification": 22,
			"Failed Privilege Escalation": 23,
			"Network Port Scan Detected": 24,
			"Service Restarted": 25,
			"Malware Alert": 26,
			"System Shutdown": 27,
			"Login Outside Business Hours": 28,
			"Data Download Exceeded": 29,
			"External Device Connected": 30,
			"Remote Access Detected": 31,
			"VPN Login": 32,
			"Security Settings Modified": 33,
			"File Encrypted": 34,
			"File Download Blocked": 35,
			"Multiple Failed Logins": 36,
			"Abnormal Privilege Usage": 37,
			"Large File Transfer": 38,
			"Unauthorized File Access": 39,
			"Configuration File Modified": 40,
			"Privilege Revoked": 41,
			"USB Device Blocked": 42,
			"Command Execution Detected": 43,
			"Suspicious File Detected": 44,
			"Software Installed": 45,
			"Software Uninstalled": 46,
			"Firewall Rule Modified": 47,
			"Suspicious Network Connection": 48,
			"Unauthorized Database Access": 49,
			"DNS Anomaly Detected": 50,
			"Unauthorized Application Usage": 51,
			"File Permissions Changed": 52,
			"Process Terminated": 53,
			"Malware Executed": 54,
			"Critical Patch Installed": 55,
			"VPN Disconnect": 56,
			"Suspicious Email Attachment": 57,
			"Application Session Timeout": 58,
			"IP Blacklisted": 59,
			"Failed Resource Access": 60,
			"Endpoint Security Disabled": 63,
			"Unauthorized File Copy": 64,
			"Abnormal Login Location": 65,
			"Suspicious Activity Grouped": 66,
			"Failed Data Upload": 67,
			"Scheduled Task Created": 68,
			"Failed File Deletion": 69,
			"Password Reset Request": 70,
			"Remote Access Denied": 71,
			"User Account Disabled": 72,
			"Unusual Process Behavior": 73,
			"Password Policy Violation": 74,
			"File Shared Externally": 75,
			"Resource Usage Spike": 76,
			"Unauthorized Script Execution": 77,
			"API Request Spike": 78,
			"Multiple VPN Logins": 79,
			"Unauthorized Process Spawned": 80,
		}




def init_keyword_scan(siem_log):
	scan_result = "null"

	token_found = False


	############################ Login
	if not token_found:
		current_tokens = ["login", "logon", "log in", "log-in", "password"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				success_tokens = ["database", "sql", "mongo"]
				for each_success_token in success_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Database Access"
							token_found = True

				success_tokens = ["success", "logged in", "logged-in"]
				for each_success_token in success_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Successful Login"
							token_found = True

				success_tokens = ["fail", "unauthoriz"]
				for each_success_token in success_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Failed Login"

							if "multi" in siem_log.lower():
								scan_result = "Multiple Failed Logins"

							token_found = True

				success_tokens = ["in to ", "app"]
				for each_success_token in success_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Application Login"
							token_found = True

				success_tokens = ["outside"]
				for each_success_token in success_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Login Outside Business Hours"
							token_found = True

				if "location" in siem_log.lower() and ("abnormal" in siem_log.lower() or "unknow" in siem_log.lower()):
					scan_result = "Abnormal Login Location"
					token_found = True

				if not token_found:
					scan_result = "Login Attempt"
					token_found = True
				break



	############################ File
	if not token_found:
		current_tokens = ["file"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				file_modify_tokens = ["encrypt"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "File Encrypted"
							token_found = True

				file_modify_tokens = ["delet", "remov"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							if "fail" in siem_log.lower():
								scan_result = "Failed File Deletion"
								token_found = True

				file_modify_tokens = ["upload", "share", "external"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							if "fail" in siem_log.lower():
								scan_result = "File Shared Externally"
								token_found = True

				file_modify_tokens = ["edit", "modif"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "File Modified"
							token_found = True

				file_modify_tokens = ["open", "access"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "File Accessed"
							token_found = True

				file_modify_tokens = ["delet", "remov"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "File Deleted"
							token_found = True

				file_modify_tokens = ["permission", "owner"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower() and ("change" in siem_log.lower() or "modifi" in siem_log.lower() or "modify" in siem_log.lower()):
							scan_result = "File Permissions Changed"
							token_found = True

				file_modify_tokens = ["large", "big"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "Large File Transfer"
							token_found = True

				file_modify_tokens = ["unauthoriz"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "Unauthorized File Access"
							token_found = True
							if "copy" in siem_log.lower() or "copied" in siem_log.lower():
								scan_result = "Unauthorized File Copy"
								token_found = True

				file_modify_tokens = ["config"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "Configuration File Modified"
							token_found = True

				file_modify_tokens = ["suspicious", "trojan", "detected"]
				for each_modify_token in file_modify_tokens:
					if not token_found:
						if each_modify_token in siem_log.lower():
							scan_result = "Suspicious File Detected"
							token_found = True

							if "multipl" in siem_log.lower():
								scan_result = "Suspicious Activity Grouped"
								token_found = True

				token_found = True
				break

	############################ Privilege Escalation
	if not token_found:
		current_tokens = ["sudo", "root", "admin"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Privilege Escalation"

				if "fail" in siem_log.lower():
					scan_result = "Failed Privilege Escalation"

				if "abnormal" in siem_log.lower() or "suspici" in siem_log.lower():
					scan_result = "Abnormal Privilege Usage"

				token_found = True
				break

	############################ Resource Access
	if not token_found:
		current_tokens = ["access", "read", "database"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				unauthorized_access_tokens = ["unauthoriz", "restrict"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Unauthorized Access Attempt"
							token_found = True

				unauthorized_access_tokens = ["fail"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Failed Resource Access"
							token_found = True

				if not token_found:
					scan_result = "Resource Access"
					token_found = True

	############################ Unauthorized Application Usage
	if not token_found:
		current_tokens = ["app", "service", "process"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				unauthorized_access_tokens = ["unauthoriz", "restrict"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Unauthorized Application Usage"
							token_found = True

				unauthorized_access_tokens = ["timeout"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Application Session Timeout"
							token_found = True

	############################ Process Terminated
	if not token_found:
		current_tokens = ["process", "service", "app"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				unauthorized_access_tokens = ["terminat", "kill", "stop"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Process Terminated"
							token_found = True

				unauthorized_access_tokens = ["unusual", "suspici", "unknow"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Unusual Process Behavior"
							token_found = True

				unauthorized_access_tokens = ["unauthoriz"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Unauthorized Process Spawned"
							token_found = True

				token_found = True
				break

	############################ Mail Operation
	if not token_found:
		current_tokens = ["email", "e-mail"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				if "send" in siem_log.lower() or "sent" in siem_log.lower():
					scan_result = "Email Sent"
					token_found = True
					break
				elif "receiv" in siem_log.lower():
					scan_result = "Email Received"
					token_found = True
					break
				elif "suspiciou" in siem_log.lower() or "spam" in siem_log.lower():
					if "attachment" in siem_log.lower():
						scan_result = "Suspicious Email Attachment"
						token_found = True

					if not token_found:
						scan_result = "Suspicious Email Detected"
						token_found = True
						break

	############################ Network Anomaly
	if not token_found:
		current_tokens = ["suspicious", "unusual", "injection", "attack", "abnormal", "restrict"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				network_anomal_tokens = ["network", "connect", "tcp", "udp"]
				for each_net_anomal_token in network_anomal_tokens:
					if not token_found:
						if each_net_anomal_token in siem_log.lower():
							scan_result = "Network Anomaly"
							token_found = True
							break

	############################ Data Download
	if not token_found:
		current_tokens = ["download"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Data Download"

				cloud_upload_tokens = ["cloud", "onedrive", "aws", "azure"]
				for each_cupload_token in cloud_upload_tokens:
					if not token_found:
						if each_cupload_token in siem_log.lower():
							scan_result = "File Upload to Cloud"
							token_found = True
							break

				cloud_upload_tokens = ["exceed"]
				for each_cupload_token in cloud_upload_tokens:
					if not token_found:
						if each_cupload_token in siem_log.lower():
							scan_result = "Data Download Exceeded"
							token_found = True
							break

				cloud_upload_tokens = ["block"]
				for each_cupload_token in cloud_upload_tokens:
					if not token_found:
						if each_cupload_token in siem_log.lower():
							scan_result = "File Download Blocked"
							token_found = True
							break

				token_found = True
				break

	############################ Privilege Revoked
	if not token_found:
		current_tokens = ["priv"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["remov", "revok"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Privilege Revoked"
							token_found = True
							break

	############################ IP Blacklisted
	if not token_found:
		current_tokens = ["blacklist", "block"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				unauthorized_access_tokens = ["ip"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "IP Blacklisted"
							token_found = True
							break

	############################ Service Restarted
	if not token_found:
		current_tokens = ["service"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["restart"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Service Restarted"
							token_found = True
							break

	############################ DNS
	if not token_found:
		current_tokens = ["dns", "bind9"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["suspicious", "tunnel", "anomal"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "DNS Anomaly Detected"
							token_found = True
							break

	############################ Firewall Rule Modified
	if not token_found:
		current_tokens = ["firewal", "rule"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["modif"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Firewall Rule Modified"
							token_found = True
							break

	############################ Data Upload
	if not token_found:
		current_tokens = ["upload"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Data Upload"
				token_found = True

				if "fail" in siem_log.lower():
					scan_result = "Failed Data Upload"
					token_found = True

				break

	############################ Account Locked
	if not token_found:
		current_tokens = ["locked"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Account Locked"
				token_found = True
				break

	############################ Scheduled Task Created
	if not token_found:
		current_tokens = ["schedule", "cron", "job"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["creat"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Scheduled Task Created"
							token_found = True
							break

	############################ Session Timeout
	if not token_found:
		current_tokens = ["timeout", "time out", "time-out"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Session Timeout"
				token_found = True
				break

	############################ Ransomware Detected
	if not token_found:
		current_tokens = ["ransom", "crypted"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Ransomware Detected"
				token_found = True
				break

	############################ Database Modification
	if not token_found:
		current_tokens = ["database", "db", "sql", "mongo"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["change", "modif"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Database Modification"
							token_found = True
							break

				unauthorized_access_tokens = ["unauthoriz"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Unauthorized Database Access"
							token_found = True
							break

	############################ Password Change
	if not token_found:
		current_tokens = ["password", "credential"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["change", "modif", "reset"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Password Change"

							if "req" in siem_log.lower():
								scan_result = "Password Reset Request"

							token_found = True
							break

				unauthorized_access_tokens = ["violat"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Password Policy Violation"
							token_found = True
							break

	############################ External Device Connected
	if not token_found:
		current_tokens = ["usb", "external devic"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "External Device Connected"

				unauthorized_access_tokens = ["block"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "USB Device Blocked"
							token_found = True

				token_found = True
				break

	############################ Network Port Scan Detected
	if not token_found:
		current_tokens = ["port", "network"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["scan"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Network Port Scan Detected"
							token_found = True
							break

				unauthorized_access_tokens = ["suspicious", "unknow"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Suspicious Network Connection"
							token_found = True
							break

				unauthorized_access_tokens = ["high", "spike"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Internal Traffic Spike"
							token_found = True
							break

	############################ Malware Alert
	if not token_found:
		current_tokens = ["virus", "malware", "rootkit", "defender", "trojan", "spyware", "threat"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				unauthorized_access_tokens = ["execut", "start", "run"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Malware Executed"
							token_found = True
							break

				if not token_found:
					scan_result = "Malware Alert"
					token_found = True
					break

	############################ System Shutdown
	if not token_found:
		current_tokens = ["shutdown", "shut-down"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "System Shutdown"
				token_found = True
				break

	############################ SSH Operation
	if not token_found:
		current_tokens = ["ssh", "rdp", "netcat", "remote"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Remote Access Detected"
				token_found = True

				if "denie" in siem_log.lower() or "deny" in siem_log.lower():
					scan_result = "Remote Access Denied"
					token_found = True

				break

	############################ Endpoint Security Disabled
	if not token_found:
		current_tokens = ["disabled"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Endpoint Security Disabled"
				token_found = True
				break

	############################ VPN Login
	if not token_found:
		current_tokens = ["vpn"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["dis-connect", "disconnect", "stop"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "VPN Disconnect"
							token_found = True
							break

				unauthorized_access_tokens = ["connect", "login", "start"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "VPN Login"

							if "multiple" in siem_log.lower():
								scan_result = "Multiple VPN Logins"

							token_found = True
							break

	############################ Security Settings Modified
	if not token_found:
		current_tokens = ["security", "firewal"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["change", "modif"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Security Settings Modified"
							token_found = True
							break

	############################ Resource Usage Spike
	if not token_found:
		current_tokens = ["high", "spike"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["system", "resource", "ram", "cpu"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Resource Usage Spike"
							token_found = True
							break

				unauthorized_access_tokens = [" api", "-api", "http"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "API Request Spike"
							token_found = True
							break

	############################ Unauthorized Script Execution
	if not token_found:
		current_tokens = ["script"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():

				unauthorized_access_tokens = ["unauthoriz"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Unauthorized Script Execution"
							token_found = True
							break

	############################ Command Execution Detected
	if not token_found:
		current_tokens = ["cmd", "command", "powershell", "bash"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Command Execution Detected"
				token_found = True
				break

	############################ Software Installed
	if not token_found:
		current_tokens = ["install"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				unauthorized_access_tokens = ["patch", "fix"]
				for each_success_token in unauthorized_access_tokens:
					if not token_found:
						if each_success_token in siem_log.lower():
							scan_result = "Critical Patch Installed"
							token_found = True
							break

				if not token_found:
					scan_result = "Software Installed"
					token_found = True
					break

	############################ Software Uninstalled
	if not token_found:
		current_tokens = ["uninstall", "un-install"]
		for current_token in current_tokens:
			if current_token in siem_log.lower():
				scan_result = "Software Uninstalled"
				token_found = True
				break

	############################ User Account Disabled
	if not token_found:
		current_tokens = ["account", "user"]
		for current_token in current_tokens:
			if current_token in siem_log.lower() and "disabl" in siem_log.lower():
				scan_result = "User Account Disabled"
				token_found = True
				break







	return scan_result





client = pymongo.MongoClient( "mongodb://mongo_admin:E171x0b98e30609be1f@localhost" )
my_db = client["eitix_dashboard"]
today = date.today()
col_date = today.strftime('%Y-%m-%d')
col_name = "wazuh.logs.data." + str(col_date)
my_collection = my_db[col_name]
cursor = my_collection.find(sort=[("_id", pymongo.DESCENDING)])


uba_scan_result_list = []
counterx = 1

######################################################################################################
######################################################################################################
######################################################################################################
for document in cursor:
	try:
		if int((time() - start_time)) > timeout_limit_seconds:
			print("Time out")
			break

		if counterx <= logs_to_scan:
			#print("Log Number: " + str(counterx))

			user_found_in_log = user_existance_check(str(document))
			#print("user_found_in_log: " + str(user_found_in_log) + "\n\n")
			if user_found_in_log != []:
				#print("User_found_log")
				counterx = counterx + 1
				rule_description = ""
				win_message = ""
				full_log = ""
				rule_id = document["id"]

				agent_id = ""
				tenant_id = ""
				agent_ip = ""
				agent_name = ""
				user_list = []
				user_type = ""
				wazuh_timestamp = ""
				log_id = ""
				data = {}

				try:
					if not document["data"]["win"]:
						data = document["data"]
				except:
					pass
				try:
					agent_id = document["agent"]["id"]
				except:
					pass
				try:
					rule_description = document["rule"]["description"]
				except:
					pass
				try:
					full_log = document["full_log"]
				except:
					pass
				try:
					win_message = str(document["data"]["win"]["system"]["message"])
				except:
					pass
				try:
					tenant_id = document["tenant_id"]
				except:
					pass
				try:
					agent_ip = document["agent"]["ip"]
				except:
					pass
				try:
					agent_name = document["agent"]["name"]
				except:
					pass
				try:
					user_list = user_found_in_log
				except:
					pass
				try:
					wazuh_timestamp = document["timestamp"]
				except:
					pass
				try:
					log_id = document["id"]
				except:
					pass


				scan_siem_text = rule_description + " " + full_log + " " + win_message





				######################################
				## Start UBA scan
				######################################
				init_keyword_scan_result = init_keyword_scan(scan_siem_text)
				#print("SIEM Log:\n" + scan_siem_text + "\n\n")
				print("init_keyword_scan_result: " + str(init_keyword_scan_result) + "\n\n")

				if init_keyword_scan_result != "null":
					for user_dict in user_list:
						data_for_db = {
							"detected_by": {"name": "token_scan"}, "siem_log": str(scan_siem_text), "action": str(init_keyword_scan_result), "agent_id": agent_id, "tenant_id": tenant_id, "agent_ip": agent_ip, "agent_name": agent_name, "username": user_dict["username"], "type": user_dict["type"], 
							"wazuh_timestamp": wazuh_timestamp, 
							"timestamp": datetime.utcnow(),
							"log_id": log_id, 
							"sequence": uba_detection_stages[str(init_keyword_scan_result)], "data": data
						}

						uba_scan_result_list.append(data_for_db)


		else:
			break

	except:
		pass


######################################################################################################
######################################################################################################
######################################################################################################





if int((time() - start_time)) < timeout_limit_seconds:
	col_name = "uba.logs"
	my_collection = my_db[col_name]

	if uba_scan_result_list:
		my_collection.insert_many(uba_scan_result_list)
		print("\n\nUBA data inserted to database...\n\n")
	else:
		print("No data to insert into database")
	#print(uba_scan_result_list)

