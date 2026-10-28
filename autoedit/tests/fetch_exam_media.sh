#!/usr/bin/env bash
# Builds the 5-scenario exam media set from public OpenCV sample data.
set -e
OUT=${1:-exam_media}; TMP=$(mktemp -d)
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/opencv/opencv.git $TMP/cv && (cd $TMP/cv && git sparse-checkout set samples/data)
git clone -q --depth 1 --filter=blob:none --sparse https://github.com/opencv/opencv_extra.git $TMP/cvx && (cd $TMP/cvx && git sparse-checkout set testdata/highgui/video)
D=$TMP/cv/samples/data; V=$TMP/cvx/testdata/highgui/video
mkdir -p $OUT/{s1_photos,s2_talking,s3_mix,s4_lowq,s5_silent}
cp $D/{building.jpg,home.jpg,castle.jpg,aero3.jpg,rgbd-color.jpg} $OUT/s1_photos/
python "$(dirname "$0")/make_sample.py" $OUT/s2_talking/raw_he.mp4 he
cp $D/{building.jpg,home.jpg} $OUT/s3_mix/; cp $V/big_buck_bunny.mp4 $OUT/s3_mix/
ffmpeg -loglevel error -y -ss 5 -t 12 -i $D/vtest.avi -c:v libx264 -crf 18 $OUT/s3_mix/street.mp4
cp $V/VID00003-20100701-2204.3GP $OUT/s4_lowq/; cp $D/{HappyFish.jpg,pic1.png,butterfly.jpg} $OUT/s4_lowq/
ffmpeg -loglevel error -y -i $D/Megamind.avi -an -c:v libx264 -crf 18 $OUT/s5_silent/megamind_silent.mp4
ffmpeg -loglevel error -y -i $D/vtest.avi -t 20 -an -c:v libx264 -crf 18 $OUT/s5_silent/street_silent.mp4
cp $V/big_buck_bunny.mp4 $OUT/s5_silent/bunny.mp4
rm -rf $TMP; echo "exam media ready in $OUT"
