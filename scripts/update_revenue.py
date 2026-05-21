#!/usr/bin/env python3
"""
update_revenue.py — Taleb's revenue update tool
Usage: python3 scripts/update_revenue.py [options]

Examples:
  # Update revenue for a business
  python3 scripts/update_revenue.py --id sterling-newsletter --revenue-total 47.50 --revenue-month 47.50 --subs-free 212 --subs-paid 3 --note "First 3 paid subscribers via Substack"

  # Change status
  python3 scripts/update_revenue.py --id sterling-newsletter --status live

  # Update budget spent
  python3 scripts/update_revenue.py --id kdp-productivity --budget-spent 18 --revenue-total 12.40 --note "First KDP royalties landed"

  # Just add a log note
  python3 scripts/update_revenue.py --id micro-saas --note "Signed up for Stripe, domain registered"

  # List all businesses and current state
  python3 scripts/update_revenue.py --list

  # After running, commit and push with:
  #   git add data/businesses.json && git commit -m "Revenue update: [date]" && git push
"""

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone

DATA_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'businesses.json')


def load():
    with open(DATA_FILE) as f:
        return json.load(f)


def save(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✅ Saved → {DATA_FILE}")


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def list_businesses(data):
    print(f"\n📊 OpenClaw Revenue — {data['meta']['last_updated']}\n")
    for b in data['businesses']:
        rev = b.get('revenue_total', 0)
        spent = b.get('budget_spent', 0)
        alloc = b.get('budget_allocated', 0)
        status = b.get('status', '?').upper()
        print(f"  [{b['cat']}] {b['name']:<28} status={status:<10} revenue=£{rev:.2f}  budget={spent}/{alloc}")
    total = sum(b.get('revenue_total', 0) for b in data['businesses'])
    budget_remaining = data['meta']['budget_total'] - sum(b.get('budget_spent', 0) for b in data['businesses'])
    print(f"\n  TOTAL REVENUE:    £{total:.2f}")
    print(f"  BUDGET REMAINING: £{budget_remaining:.2f}\n")


def find_business(data, bid):
    for b in data['businesses']:
        if b['id'] == bid:
            return b
    ids = [b['id'] for b in data['businesses']]
    raise ValueError(f"Business '{bid}' not found. Valid IDs: {ids}")


def main():
    parser = argparse.ArgumentParser(description="Update OpenClaw revenue data")
    parser.add_argument('--id',             help='Business ID to update')
    parser.add_argument('--revenue-total',  type=float, help='Cumulative total revenue (£)')
    parser.add_argument('--revenue-month',  type=float, help='Revenue this calendar month (£)')
    parser.add_argument('--budget-spent',   type=float, help='Budget spent so far (£)')
    parser.add_argument('--subs-free',      type=int,   help='Free subscriber count')
    parser.add_argument('--subs-paid',      type=int,   help='Paid subscriber count')
    parser.add_argument('--status',         choices=['planned','building','live','growing','paused'], help='Business status')
    parser.add_argument('--launched',       help='Launch date (YYYY-MM-DD)')
    parser.add_argument('--note',           help='Log entry note to append')
    parser.add_argument('--list',           action='store_true', help='List all businesses and exit')
    parser.add_argument('--push',           action='store_true', help='Auto git add + commit + push after update')
    args = parser.parse_args()

    data = load()

    if args.list:
        list_businesses(data)
        return

    if not args.id:
        parser.error("--id is required (use --list to see valid IDs)")

    biz = find_business(data, args.id)
    changes = []

    if args.revenue_total is not None:
        old = biz.get('revenue_total', 0)
        biz['revenue_total'] = args.revenue_total
        changes.append(f"revenue_total: £{old:.2f} → £{args.revenue_total:.2f}")

    if args.revenue_month is not None:
        biz['revenue_this_month'] = args.revenue_month
        changes.append(f"revenue_this_month: £{args.revenue_month:.2f}")

    if args.budget_spent is not None:
        old = biz.get('budget_spent', 0)
        biz['budget_spent'] = args.budget_spent
        changes.append(f"budget_spent: £{old:.2f} → £{args.budget_spent:.2f}")

    if args.subs_free is not None:
        biz['subscribers_free'] = args.subs_free
        changes.append(f"subscribers_free: {args.subs_free}")

    if args.subs_paid is not None:
        biz['subscribers_paid'] = args.subs_paid
        changes.append(f"subscribers_paid: {args.subs_paid}")

    if args.status:
        old = biz.get('status', '?')
        biz['status'] = args.status
        changes.append(f"status: {old} → {args.status}")

    if args.launched:
        biz['launched'] = args.launched
        changes.append(f"launched: {args.launched}")

    if not changes and not args.note:
        print("⚠️  Nothing to update — pass at least one field or --note")
        return

    # Build log entry
    ts = now_iso()
    if args.note or changes:
        log_entry = {"ts": ts, "note": args.note or "; ".join(changes)}
        if 'log' not in biz:
            biz['log'] = []
        biz['log'].append(log_entry)

    # Update meta
    data['meta']['last_updated'] = ts
    data['meta']['updated_by'] = 'Taleb'

    save(data)

    print(f"\n🤖 [{biz['name']}] updated at {ts}")
    for c in changes:
        print(f"   • {c}")
    if args.note:
        print(f"   📝 {args.note}")

    # Show new totals
    list_businesses(data)

    if args.push:
        print("🚀 Pushing to git…")
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        subprocess.run(['git', '-C', repo_root, 'add', 'data/businesses.json'], check=True)
        commit_msg = f"Revenue update ({ts[:10]}): {biz['name']}"
        if args.note:
            commit_msg += f" — {args.note[:60]}"
        subprocess.run(['git', '-C', repo_root, 'commit', '-m', commit_msg], check=True)
        subprocess.run(['git', '-C', repo_root, 'push'], check=True)
        print("✅ Pushed. Netlify will rebuild in ~30s.")
    else:
        print("\n💡 To deploy: git add data/businesses.json && git commit -m 'Revenue update' && git push")


if __name__ == '__main__':
    main()
