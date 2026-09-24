package bwapi;

import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class SingleMatchLifecycleTest {
    private static final class StubClient extends Client {
        private final CountDownLatch attempted = new CountDownLatch(1);
        private final boolean connects;
        private int attempts;

        StubClient(boolean connects) {
            super(new BWClient(new DefaultBWListener()));
            this.connects = connects;
        }

        @Override
        boolean connect() {
            attempts++;
            attempted.countDown();
            return connects;
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static void testUnitSlots() throws Exception {
        Game game = new Game();
        Field units = Game.class.getDeclaredField("units");
        units.setAccessible(true);
        units.set(game, new Unit[2]);

        game.ensureUnitCapacity(2);
        check(((Unit[]) units.get(game)).length >= 3, "equal-length ID must grow");
        game.ensureUnitCapacity(9999);
        check(((Unit[]) units.get(game)).length == 10000, "largest shared-memory ID must fit");
        for (int invalid : new int[] {-1, 10000, Integer.MAX_VALUE}) {
            try {
                game.ensureUnitCapacity(invalid);
                throw new AssertionError("accepted invalid shared-memory ID " + invalid);
            } catch (IllegalArgumentException expected) {
                check(((Unit[]) units.get(game)).length == 10000,
                        "invalid ID changed unit capacity");
            }
        }
    }

    private static void testRetries() throws Exception {
        StubClient successful = new StubClient(true);
        check(successful.reconnectUntil(System.nanoTime() - 1), "successful first attempt lost");
        check(successful.attempts == 1, "successful connection retried");

        StubClient expired = new StubClient(false);
        check(!expired.reconnectUntil(System.nanoTime() - 1), "expired retry continued");
        check(expired.attempts == 1, "expired retry made more than one attempt");

        StubClient interrupted = new StubClient(false);
        AtomicBoolean stopped = new AtomicBoolean();
        AtomicBoolean interruptPreserved = new AtomicBoolean();
        Thread thread = new Thread(() -> {
            stopped.set(!interrupted.reconnectUntil(Long.MAX_VALUE));
            interruptPreserved.set(Thread.currentThread().isInterrupted());
        });
        thread.start();
        check(interrupted.attempted.await(2, TimeUnit.SECONDS), "retry did not start");
        thread.interrupt();
        thread.join(2000);
        check(!thread.isAlive() && stopped.get() && interruptPreserved.get(),
                "interrupt did not stop retry and preserve the flag");
        check(interrupted.attempts == 1, "interrupted retry made another attempt");
    }

    public static void main(String[] args) throws Exception {
        testUnitSlots();
        testRetries();
        System.out.println("SingleMatchLifecycleTest passed");
    }
}
