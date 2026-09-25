import logging
import time

from app.database.session import SessionLocal
from app.services.integrations import deliver, pending_deliveries


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("integration-worker")


def run() -> None:
    while True:
        try:
            with SessionLocal() as db:
                items = pending_deliveries(db)
                for item in items:
                    deliver(db, item)
            time.sleep(2 if items else 5)
        except KeyboardInterrupt:
            return
        except Exception:
            logger.exception("Delivery worker iteration failed")
            time.sleep(5)


if __name__ == "__main__":
    run()
