package learning;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;

public final class LearningHistoryHarness {
    private static final String NAME = "../opponent,\nunsafe";
    private static final String RACE = "Zerg";

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected scenario");
        if ("history".equals(args[0])) history();
        else if ("links".equals(args[0])) links();
        else if ("limits".equals(args[0])) limits();
        else if ("random".equals(args[0])) randomRace();
        else throw new IllegalArgumentException(args[0]);
        System.out.println("PASS " + args[0]);
    }

    private static void history() throws Exception {
        LearningHistoryRepository repo = new LearningHistoryRepository(NAME, RACE);
        check(repo.fileName().matches("opponent-[a-f0-9]{64}\\.csv"), "unsafe filename");
        check(repo.load().games().isEmpty(), "fresh profile");
        Path read = Paths.get("bwapi-data/read");
        Path write = Paths.get("bwapi-data/write");
        Files.createDirectories(read);
        repo.append(record(1, "first"));
        Path output = write.resolve(repo.fileName());
        Path baseline = read.resolve(repo.fileName());
        check(Files.readAllLines(output, StandardCharsets.UTF_8).size() == 2,
                "CSV controls must stay on one line");
        Files.move(output, baseline);
        repo.append(record(2, "second"));
        repo.append(record(3, "third"));
        check(repo.load().games().size() == 3, "baseline and repeated writes");
        check("third".equals(repo.load().lastGame().getOpener()), "latest opener");
        Files.write(write.resolve("history-crashed.tmp"), "incomplete".getBytes(StandardCharsets.UTF_8));
        check(repo.load().games().size() == 3, "crash temp must not hide prior state");
        String bad = "bad,row\n4,true,NaN,map,opponent,Zerg,opener,build,strategy,4\n";
        Files.write(output, bad.getBytes(StandardCharsets.UTF_8), StandardOpenOption.APPEND);
        check(repo.load().games().size() == 3, "malformed rows skipped");
        repo.append(record(5, "recovered"));
        check(repo.load().games().size() == 4, "append after malformed rows");
        check(!new String(Files.readAllBytes(output), StandardCharsets.UTF_8).contains("bad,row"),
                "malformed rows removed");
        Files.write(output, new byte[256 * 1024 + 1]);
        check(repo.load().games().isEmpty(), "oversized file ignored");
        repo.append(record(6, "bounded"));
        check(repo.load().games().size() == 1 && Files.size(output) <= 256 * 1024,
                "bounded recovery");
        Files.delete(output);
        Files.delete(baseline);
        check(repo.load().games().isEmpty(), "reset");
        repo.append(record(7, "new"));
        check(repo.load().games().size() == 1, "post-reset learning");
        check(!Files.exists(Paths.get("opponent,")), "name escaped profile");
    }

    private static void randomRace() throws Exception {
        LearningHistoryRepository random = new LearningHistoryRepository("RandomOpponent", "Random");
        GameRecord first = record(1, "first");
        first.setOpponentName("RandomOpponent");
        first.setOpponentRace("Zerg");
        random.append(first);
        GameRecord second = record(2, "second");
        second.setOpponentName("RandomOpponent");
        second.setOpponentRace("Terran");
        random.append(second);
        check(random.load().games().size() == 2, "Random grouping must keep resolved races");
        LearningHistoryRepository concrete = new LearningHistoryRepository("RandomOpponent", "Zerg");
        try {
            concrete.append(second);
            throw new AssertionError("Concrete matchup accepted another race");
        } catch (IOException expected) {
        }
    }

    private static void limits() throws Exception {
        LearningHistoryRepository repo = new LearningHistoryRepository(NAME, RACE);
        for (int i = 1; i <= 1030; i++) {
            repo.append(record(i, "bounded"));
        }
        check(repo.load().games().size() == 1024, "record count bounded");
        check(repo.load().games().get(0).getTimestamp() == 7, "oldest records trimmed");
        check(repo.load().lastGame().getTimestamp() == 1030, "newest result preserved");
    }

    private static void links() throws Exception {
        Path outside = Paths.get("outside");
        Path write = Paths.get("bwapi-data/write");
        Path sentinel = outside.resolve("sentinel");
        check(Files.exists(write), "Test runner must provision a linked write directory");
        LearningHistoryRepository repo = new LearningHistoryRepository(NAME, RACE);
        refusal(() -> repo.append(record(1, "blocked")));
        check("keep".equals(new String(Files.readAllBytes(sentinel), StandardCharsets.UTF_8)),
                "outside file changed");
    }

    private static GameRecord record(long time, String opener) {
        return GameRecord.builder().timestamp(time).numStartingLocations(4)
                .mapName("map,\nname").opponentName(NAME).opponentRace(RACE)
                .opener(opener).buildOrder("build").detectedStrategies("strategy")
                .isWinner(true).frameCount(100).build();
    }

    private static void refusal(Checked operation) throws Exception {
        try {
            operation.run();
            throw new AssertionError("unsafe link accepted");
        } catch (IOException expected) {
        }
    }

    private static void check(boolean okay, String message) {
        if (!okay) throw new AssertionError(message);
    }

    private interface Checked {
        void run() throws Exception;
    }
}

