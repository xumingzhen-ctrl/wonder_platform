import sys
import os
import json
import logging

# Ensure we're in the right directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Configure logging to see what's happening
logging.basicConfig(level=logging.INFO)

from portfolio_engine import create_report

try:
    report = create_report(49)
    print("NAV_RESULT:", report['total_nav'])
    print("COUNT_RESULT:", len(report['details']))
    # Print the first row
    if report['details']:
        print("SAMPLE_ROW:", report['details'][0])
except Exception as e:
    import traceback
    traceback.print_exc()
