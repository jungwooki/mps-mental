"""Run only with trusted Admin credentials; preserves existing custom claims."""
import argparse
import firebase_admin
from firebase_admin import auth

parser = argparse.ArgumentParser()
parser.add_argument('uid')
parser.add_argument('--player', action='append', default=[])
parser.add_argument('--admin', action='store_true')
args = parser.parse_args()
firebase_admin.initialize_app(options={'projectId': 'mpsreserve'})
user = auth.get_user(args.uid)
claims = {**(user.custom_claims or {}), 'mentalCoach': True, 'mentalAdmin': args.admin, 'mentalPlayerIds': args.player}
auth.set_custom_user_claims(args.uid, claims)
print('Coach claims updated. Sign in again to refresh the ID token.')
