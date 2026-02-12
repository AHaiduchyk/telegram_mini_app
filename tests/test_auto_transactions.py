import importlib
import os
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from sqlmodel import Session, select


def load_app(tmp_path: Path):
    repo_root = Path(__file__).resolve().parents[1]
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path}/test.db"
    # Reload db/app modules to pick up new DB URL
    if "app.db" in sys.modules:
        importlib.reload(sys.modules["app.db"])
    else:
        import app.db  # noqa: F401
    if "app.main" in sys.modules:
        importlib.reload(sys.modules["app.main"])
    else:
        import app.main  # noqa: F401
    import app.db as db
    import app.main as main
    db.init_db()
    return main, db


def test_apply_due_subscriptions_creates_transactions(tmp_path: Path):
    main, db = load_app(tmp_path)
    from app.models import Subscription, Transaction, User

    with Session(db.engine) as session:
        user = User(tg_user_id=1, is_premium=True)
        session.add(user)
        session.commit()

        start_date = date.today() - timedelta(days=7)
        sub = Subscription(
            tg_user_id=1,
            amount=Decimal("10.00"),
            category="subscriptions",
            period="weekly",
            anchor_day=start_date.day,
            anchor_month=start_date.month,
            next_run_date=datetime.combine(start_date, datetime.min.time()),
            is_active=True,
        )
        session.add(sub)
        session.commit()

        main._apply_due_subscriptions(1, session)

        txs = session.exec(select(Transaction).where(Transaction.tg_user_id == 1)).all()
        assert len(txs) >= 1
        refreshed = session.exec(select(Subscription).where(Subscription.id == sub.id)).first()
        assert refreshed is not None
        assert refreshed.next_run_date.date() > date.today() - timedelta(days=1)


def test_next_subscription_date_monthly_end_of_month(tmp_path: Path):
    main, _ = load_app(tmp_path)
    base = date(2026, 1, 31)
    result = main._next_subscription_date(base, anchor_day=31, anchor_month=1, period="monthly")
    assert result.month == 2
    assert result.day in (28, 29)
