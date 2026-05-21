#!/usr/bin/env python3
"""
update_revenue.py — Taleb's revenue update tool
Usage: python3 scripts/update_revenue.py [options]

═══ UPDATING AN EXISTING BUSINESS ═══════════════════════════════════════════

  # Update revenue figures
  python3 scripts/update_revenue.py --id sterling-newsletter \
    --revenue-total 47.50 --revenue-month 47.50 \
    --subs-free 212 --subs-paid 3 \
    --note "First 3 paid subscribers via Substack"

  # Rename a business (and optionally update tagline + category)
  python3 scripts/update_revenue.py --id sterling-newsletter \
    --rename "Sterling Intelligence" \
    --tagline "Sharp strategy for sharp leaders." \
    --note "Rebranded after audience research"

  # Change status
  python3 scripts/update_revenue.py --id sterling-newsletter --status live

  # Update budget spent
  python3 scripts/update_revenue.py --id kdp-productivity \
    --budget-spent 18 --revenue-total 12.40 \
    --note "First KDP royalties landed"

  # Just add a log note
  python3 scripts/update_revenue.py --id micro-saas \
    --note "Signed up for Stripe, domain registered"

═══ ADDING A NEW BUSINESS ════════════════════════════════════════════════════

  python3 scripts/update_revenue.py --add \
    --id "prompt-packs" \
    --name "Prompt Packs" \
    --type "Digital Product" \
    --cat "DIG" \
    --tagline "Curated AI prompt bundles for professionals." \
    --budget-allocated 10 \
    --target-monthly 250 \
    --target-year 2000 \
    --note "Pivoted from Etsy — launching on Gumroad instead"

  CAT codes: NWL=newsletter, KDP=Amazon KDP, ETY=Etsy, SAS=micro-SaaS,
             DIG=digital product, AGY=agency/service, any 3-char code works

═══ REMOVING A BUSINESS ══════════════════════════════════════════════════════

  python3 scripts/update_revenue.py --remove --id "etsy-digital" \
    --note "Shutting down — poor ROI vs time cost"

═══ LISTING / DEPLOYING ══════════════════════════════════════════════════════

  # List all businesses and current state
  python3 scripts/update_revenue.py --list

  # Any command + --push to auto git-commit and deploy
  python3 scripts/update_revenue.py --id sterling-newsletter \
    --revenue-total 47.50 --push
"""

import argparse
import json
import os
import re
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


def slugify(s):
    return re.sub(r'[^a-z0-9-]', '-', s.lower()).strip('-')


def list_businesses(data):
    print(f"\n📊 OpenClaw Revenue — {data['meta']['last_updated']}\n")
    for b in data['businesses']:
        rev = b.get('revenue_total', 0)
        spent = b.get('budget_spent', 0)
        alloc = b.get('budget_allocated', 0)
        status = b.get('status', '?').upper()
        print(f"  [{b['cat']}] {b['name']:<30} id={b['id']:<22} status={status:<10} revenue=£{rev:.2f}  budget={spent}/{alloc}")
    total = sum(b.get('revenue_total', 0) for b in data['businesses'])
    budget_remaining = data['meta']['budget_total'] - sum(b.get('budget_spent', 0) for b in data['businesses'])
    print(f"\n  BUSINESSES:       {len(data['businesses'])}")
    print(f"  TOTAL REVENUE:    £{total:.2f}")
    print(f"  BUDGET REMAINING: £{budget_remaining:.2f}\n")


def find_business(data, bid):
    for b in data['businesses']:
        if b['id'] == bid:
            return b
    ids = [b['id'] for b in data['businesses']]
    raise ValueError(f"Business '{bid}' not found. Valid IDs: {ids}")


def main():
    parser = argparse.ArgumentParser(description="Update OpenClaw revenue data")

    # Target / mode
    parser.add_argument('--id',               help='Business ID to target')
    parser.add_argument('--list',             action='store_true', help='List all businesses and exit')
    parser.add_argument('--add',              action='store_true', help='Add a new business (requires --id --name --type --cat --tagline)')
    parser.add_argument('--remove',           action='store_true', help='Remove a business by --id')

    # Identity fields (used for --add and --rename)
    parser.add_argument('--name',             help='Business display name')
    parser.add_argument('--rename',           help='New display name for an existing business')
    parser.add_argument('--type',             help='Business type description (e.g. "Newsletter", "KDP Publishing")')
    parser.add_argument('--cat',              help='3-char category code (NWL, KDP, ETY, SAS, DIG, AGY…)')
    parser.add_argument('--tagline',          help='One-line tagline describing the business')

    # Financial / operational fields
    parser.add_argument('--revenue-total',    type=float, help='Cumulative total revenue (£)')
    parser.add_argument('--revenue-month',    type=float, help='Revenue this calendar month (£)')
    parser.add_argument('--budget-allocated', type=float, help='Budget allocated to this business (£)')
    parser.add_argument('--budget-spent',     type=float, help='Budget spent so far (£)')
    parser.add_argument('--target-monthly',   type=float, help='Monthly revenue target (£)')
    parser.add_argument('--target-year',      type=float, help='Annual revenue target (£)')
    parser.add_argument('--subs-free',        type=int,   help='Free subscriber count')
    parser.add_argument('--subs-paid',        type=int,   help='Paid subscriber count')
    parser.add_argument('--users',            type=int,   help='User/customer count')
    parser.add_argument('--titles-live',      type=int,   help='Live titles/listings count')
    parser.add_argument('--status',           choices=['planned','building','live','growing','paused'], help='Business status')
    parser.add_argument('--launched',         help='Launch date (YYYY-MM-DD)')

    # Logging / deploy
    parser.add_argument('--note',             help='Log entry note to append')
    parser.add_argument('--push',             action='store_true', help='Auto git add + commit + push after update')

    args = parser.parse_args()
    data = load()
    ts = now_iso()

    # ── LIST ────────────────────────────────────────────────────────────────
    if args.list:
        list_businesses(data)
        return

    if not args.id:
        parser.error("--id is required (use --list to see valid IDs, or --add to create one)")

    # ── ADD ─────────────────────────────────────────────────────────────────
    if args.add:
        # Validate no duplicate
        existing_ids = [b['id'] for b in data['businesses']]
        if args.id in existing_ids:
            raise ValueError(f"Business '{args.id}' already exists. Use --rename to rename it.")

        for req in ('name', 'type', 'cat', 'tagline'):
            if not getattr(args, req):
                parser.error(f"--{req} is required when using --add")

        new_biz = {
            'id':                args.id,
            'name':              args.name,
            'type':              args.type,
            'cat':               args.cat.upper(),
            'tagline':           args.tagline,
            'status':            args.status or 'planned',
            'budget_allocated':  args.budget_allocated or 0,
            'budget_spent':      args.budget_spent or 0,
            'revenue_total':     args.revenue_total or 0.0,
            'revenue_this_month':args.revenue_month or 0.0,
            'target_monthly':    args.target_monthly or 0,
            'target_year':       args.target_year or 0,
            'launched':          args.launched or None,
            'log':               [{'ts': ts, 'note': args.note or 'Business added'}]
        }
        # Optional metrics
        if args.subs_free is not None:  new_biz['subscribers_free'] = args.subs_free
        if args.subs_paid is not None:  new_biz['subscribers_paid'] = args.subs_paid
        if args.users is not None:      new_biz['users'] = args.users
        if args.titles_live is not None:new_biz['titles_live'] = args.titles_live

        data['businesses'].append(new_biz)
        data['meta']['last_updated'] = ts
        data['meta']['updated_by'] = 'Taleb'
        save(data)

        print(f"\n🆕 Added [{new_biz['cat']}] {new_biz['name']} (id: {new_biz['id']})")
        if args.note:
            print(f"   📝 {args.note}")
        list_businesses(data)
        commit_subject = f"Add business: {new_biz['name']}"

    # ── REMOVE ──────────────────────────────────────────────────────────────
    elif args.remove:
        biz = find_business(data, args.id)
        biz_name = biz['name']
        data['businesses'] = [b for b in data['businesses'] if b['id'] != args.id]
        data['meta']['last_updated'] = ts
        data['meta']['updated_by'] = 'Taleb'
        save(data)

        print(f"\n🗑️  Removed [{biz['cat']}] {biz_name} (id: {args.id})")
        if args.note:
            print(f"   📝 {args.note}")
        list_businesses(data)
        commit_subject = f"Remove business: {biz_name}"

    # ── UPDATE ──────────────────────────────────────────────────────────────
    else:
        biz = find_business(data, args.id)
        changes = []

        if args.rename:
            old = biz['name']
            biz['name'] = args.rename
            changes.append(f"name: '{old}' → '{args.rename}'")

        if args.tagline:
            biz['tagline'] = args.tagline
            changes.append(f"tagline updated")

        if args.cat:
            old = biz.get('cat', '?')
            biz['cat'] = args.cat.upper()
            changes.append(f"cat: {old} → {args.cat.upper()}")

        if args.type:
            biz['type'] = args.type
            changes.append(f"type: {args.type}")

        if args.revenue_total is not None:
            old = biz.get('revenue_total', 0)
            biz['revenue_total'] = args.revenue_total
            changes.append(f"revenue_total: £{old:.2f} → £{args.revenue_total:.2f}")

        if args.revenue_month is not None:
            biz['revenue_this_month'] = args.revenue_month
            changes.append(f"revenue_this_month: £{args.revenue_month:.2f}")

        if args.budget_allocated is not None:
            old = biz.get('budget_allocated', 0)
            biz['budget_allocated'] = args.budget_allocated
            changes.append(f"budget_allocated: £{old:.2f} → £{args.budget_allocated:.2f}")

        if args.budget_spent is not None:
            old = biz.get('budget_spent', 0)
            biz['budget_spent'] = args.budget_spent
            changes.append(f"budget_spent: £{old:.2f} → £{args.budget_spent:.2f}")

        if args.target_monthly is not None:
            biz['target_monthly'] = args.target_monthly
            changes.append(f"target_monthly: £{args.target_monthly:.2f}")

        if args.target_year is not None:
            biz['target_year'] = args.target_year
            changes.append(f"target_year: £{args.target_year:.2f}")

        if args.subs_free is not None:
            biz['subscribers_free'] = args.subs_free
            changes.append(f"subscribers_free: {args.subs_free}")

        if args.subs_paid is not None:
            biz['subscribers_paid'] = args.subs_paid
            changes.append(f"subscribers_paid: {args.subs_paid}")

        if args.users is not None:
            biz['users'] = args.users
            changes.append(f"users: {args.users}")

        if args.titles_live is not None:
            biz['titles_live'] = args.titles_live
            changes.append(f"titles_live: {args.titles_live}")

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

        log_entry = {"ts": ts, "note": args.note or "; ".join(changes)}
        if 'log' not in biz:
            biz['log'] = []
        biz['log'].append(log_entry)

        data['meta']['last_updated'] = ts
        data['meta']['updated_by'] = 'Taleb'
        save(data)

        print(f"\n🤖 [{biz['name']}] updated at {ts}")
        for c in changes:
            print(f"   • {c}")
        if args.note:
            print(f"   📝 {args.note}")
        list_businesses(data)
        commit_subject = f"Revenue update ({ts[:10]}): {biz['name']}"
        if args.note:
            commit_subject += f" — {args.note[:60]}"

    # ── PUSH ────────────────────────────────────────────────────────────────
    if args.push:
        print("🚀 Pushing to git…")
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        subprocess.run(['git', '-C', repo_root, 'add', 'data/businesses.json'], check=True)
        subprocess.run(['git', '-C', repo_root, 'commit', '-m', commit_subject], check=True)
        subprocess.run(['git', '-C', repo_root, 'push'], check=True)
        print("✅ Pushed. Netlify will rebuild in ~30s.")
    else:
        print("💡 To deploy: git add data/businesses.json && git commit -m 'update' && git push")
        print("   Or re-run with --push to do it automatically.")


if __name__ == '__main__':
    main()
