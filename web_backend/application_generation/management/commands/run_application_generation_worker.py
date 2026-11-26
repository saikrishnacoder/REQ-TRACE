import time

from django.core.management.base import BaseCommand

from application_generation.services import process_next_generation_run


class Command(BaseCommand):
    help = "Process queued SpecForge application-generation jobs."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Process one available job and exit.")
        parser.add_argument("--poll-seconds", type=float, default=2.0)

    def handle(self, *args, **options):
        poll_seconds = max(0.25, options["poll_seconds"])
        while True:
            run = process_next_generation_run()
            if run is not None:
                self.stdout.write(f"Generation run {run.pk}: {run.state}")
            if options["once"]:
                return
            if run is None:
                time.sleep(poll_seconds)
